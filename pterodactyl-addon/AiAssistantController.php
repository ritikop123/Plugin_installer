<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Throwable;
use GuzzleHttp\Client;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Repositories\Wings\DaemonPowerRepository;
use Pterodactyl\Repositories\Wings\DaemonCommandRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class AiAssistantController extends ClientApiController
{
    private const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

    protected DaemonFileRepository $fileRepository;
    protected DaemonPowerRepository $powerRepository;
    protected DaemonCommandRepository $commandRepository;
    protected Client $httpClient;

    public function __construct(
        DaemonFileRepository $fileRepository,
        DaemonPowerRepository $powerRepository,
        DaemonCommandRepository $commandRepository
    ) {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->powerRepository = $powerRepository;
        $this->commandRepository = $commandRepository;
        $this->httpClient = new Client([
            'timeout' => 30.0,
            'http_errors' => false,
        ]);
    }

    /**
     * Retrieve general info for the AI dashboard (allocations, plugins, resources, server state)
     * GET /api/client/servers/{server}/ai/info
     */
    public function info(Request $request, Server $server): JsonResponse
    {
        $allocations = $this->getServerAllocations($server);
        $plugins = $this->getInstalledPlugins($server);

        return response()->json([
            'success' => true,
            'server' => [
                'name' => $server->name,
                'uuid' => $server->uuid,
                'status' => $server->status,
                'memory_limit' => $server->memory,
                'disk_limit' => $server->disk,
                'cpu_limit' => $server->cpu,
            ],
            'allocations' => $allocations,
            'plugins_count' => count($plugins),
            'plugins' => array_slice($plugins, 0, 50),
            'ai' => [
                'provider' => 'Groq (Ultra-Fast)',
                'model' => $this->getGroqModel(),
                'active' => true,
            ],
        ]);
    }

    /**
     * Analyze Console logs / crash reports for errors & suggest auto-fixes
     * POST /api/client/servers/{server}/ai/diagnose
     */
    public function diagnose(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $logData = $this->extractRelevantLogs($server);

        if (empty($logData['raw'])) {
            return response()->json([
                'success' => true,
                'has_error' => false,
                'message' => 'No logs or error messages found. The server log appears clean or empty.',
                'log_snippet' => '',
            ]);
        }

        $allocations = $this->getServerAllocations($server);
        $allocStr = json_encode($allocations);

        $prompt = <<<PROMPT
You are an expert Minecraft Server Engineer and Diagnoser.
Analyze the following server log and identify if there is any error, crash, or startup failure.

Server Allocations: {$allocStr}
Logs:
```
{$logData['filtered']}
```

Return a JSON object with EXACTLY these keys:
{
  "has_error": boolean,
  "issue_title": "Short title of the problem (e.g. EULA Not Accepted, Port Conflict, Java Version Mismatch, Corrupted Chunk, Missing Dependency)",
  "cause": "Clear 1-2 sentence explanation of why it happened",
  "solution": "Clear explanation of how to fix it",
  "auto_fixable": boolean,
  "action_type": "One of: accept_eula, fix_port_conflict, install_geyser, install_voicechat, optimize_config, remove_corrupted_jar, none",
  "action_params": {},
  "requires_restart": boolean
}
PROMPT;

        $aiResponse = $this->callGroqAi([
            ['role' => 'system', 'content' => 'You are an expert Minecraft server diagnoser. Always output ONLY valid JSON.'],
            ['role' => 'user', 'content' => $prompt],
        ], true);

        $parsed = json_decode($aiResponse, true);

        if (!$parsed || !isset($parsed['has_error'])) {
            // Heuristic fallback if LLM returned non-JSON
            $isEula = str_contains($logData['raw'], 'eula.txt');
            $isPort = str_contains($logData['raw'], 'FAILED TO BIND TO PORT') || str_contains($logData['raw'], 'Address already in use');

            $parsed = [
                'has_error' => ($isEula || $isPort || str_contains($logData['raw'], 'Exception')),
                'issue_title' => $isEula ? 'EULA Not Accepted' : ($isPort ? 'Port Already in Use' : 'Server Startup Exception'),
                'cause' => $isEula ? 'The Minecraft EULA has not been agreed to.' : 'Server crashed or encountered an error.',
                'solution' => $isEula ? 'Set eula=true in eula.txt.' : 'Check the server logs for missing dependencies or conflicting plugins.',
                'auto_fixable' => ($isEula || $isPort),
                'action_type' => $isEula ? 'accept_eula' : ($isPort ? 'fix_port_conflict' : 'none'),
                'action_params' => [],
                'requires_restart' => true,
            ];
        }

        return response()->json([
            'success' => true,
            'diagnosis' => $parsed,
            'source_file' => $logData['source'],
            'log_snippet' => $logData['snippet'],
        ]);
    }

    /**
     * Executes automatic repair for recognized issues and optionally starts/restarts server
     * POST /api/client/servers/{server}/ai/autofix
     */
    public function autofix(Request $request, Server $server): JsonResponse
    {
        $action = trim((string) $request->input('action_type', ''));
        $shouldStart = (bool) $request->input('start_server', true);
        $message = '';

        try {
            switch ($action) {
                case 'accept_eula':
                    $this->fileRepository->setServer($server)->putContent('/eula.txt', "eula=true\n");
                    $message = 'Accepted Minecraft EULA by updating eula.txt.';
                    break;

                case 'fix_port_conflict':
                    $primaryAlloc = $server->allocation;
                    if ($primaryAlloc) {
                        $this->updateServerPropertiesKey($server, 'server-port', (string) $primaryAlloc->port);
                        $this->updateServerPropertiesKey($server, 'server-ip', '0.0.0.0');
                        $message = "Bound server-port to primary allocation: {$primaryAlloc->port}.";
                    } else {
                        $message = 'No primary allocation found to bind.';
                    }
                    break;

                case 'remove_session_lock':
                    try {
                        $this->fileRepository->setServer($server)->deleteFiles('/world', ['session.lock']);
                        $message = 'Removed stale world session.lock file.';
                    } catch (Throwable $e) {
                        $message = 'No stale session.lock was present.';
                    }
                    break;

                case 'optimize_config':
                    $this->applyStandardOptimizations($server);
                    $message = 'Applied lag-reduction settings to server properties and paper configs.';
                    break;

                default:
                    return response()->json([
                        'success' => false,
                        'message' => "Unrecognized auto-fix action: '{$action}'",
                    ], 400);
            }

            // If requested, start or restart the server now
            if ($shouldStart) {
                try {
                    $this->powerRepository->setServer($server)->send('restart');
                    $message .= ' Server reboot initiated.';
                } catch (Throwable $e) {
                    try {
                        $this->powerRepository->setServer($server)->send('start');
                        $message .= ' Server start command dispatched.';
                    } catch (Throwable $e2) {
                        $message .= ' Note: Could not automatically trigger power command (' . $e2->getMessage() . ').';
                    }
                }
            }

            return response()->json([
                'success' => true,
                'message' => $message,
            ]);
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Auto-fix error: " . $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'Failed to apply auto-fix: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Interactive AI Chat with function calling / tools
     * POST /api/client/servers/{server}/ai/chat
     */
    public function chat(Request $request, Server $server): JsonResponse
    {
        try {
            $message = trim((string) $request->input('message', ''));
            $history = (array) $request->input('history', []);

            if (empty($message)) {
                return response()->json(['success' => false, 'message' => 'Message is required.'], 400);
            }

            $allocations = $this->getServerAllocations($server);
            $plugins = $this->getInstalledPlugins($server);
            $pluginCount = count($plugins);
            $allocJson = json_encode($allocations);
            $pluginsList = !empty($plugins) ? implode(', ', $plugins) : 'None detected or daemon unreachable';

            $geyserStatus = 'Not configured or not installed';
            try {
                $gConf = $this->fileRepository->setServer($server)->getContent('/plugins/Geyser-Spigot/config.yml');
                if (!empty($gConf)) {
                    $bPort = '19132';
                    if (preg_match('/port:\s*(\d+)/', $gConf, $m)) {
                        $bPort = $m[1];
                    }
                    $geyserStatus = "INSTALLED & ACTIVE (Configured Bedrock Port: {$bPort})";
                }
            } catch (Throwable $e) {}

            $voiceStatus = 'Not configured or not installed';
            try {
                $vConf = $this->fileRepository->setServer($server)->getContent('/plugins/voicechat/voicechat-server.properties');
                if (!empty($vConf)) {
                    $vPort = '24454';
                    if (preg_match('/port\s*=\s*(\d+)/', $vConf, $m)) {
                        $vPort = $m[1];
                    }
                    $voiceStatus = "INSTALLED & ACTIVE (Configured UDP Port: {$vPort})";
                }
            } catch (Throwable $e) {}

            $matchedPlugins = $this->findRelevantPlugins($message, $plugins);
            $matchedSection = !empty($matchedPlugins)
                ? "MATCHED PLUGINS RELEVANT TO USER QUERY:\n- " . implode("\n- ", $matchedPlugins)
                : "No specific plugin keywords matched directly from query.";

            $systemPrompt = <<<SYS
You are an expert Minecraft Server Administrator and AI Co-Pilot with real-time visibility and direct administrative control over this server.
Your user is the server owner. You assist them with server diagnostics, plugin inquiries, updates, Bedrock crossplay, voice chat, port allocations, and optimizations.

Current Server State:
- Server Name: {$server->name}
- Memory: {$server->memory} MB | Disk: {$server->disk} MB
- Primary & Extra Port Allocations: {$allocJson}
- Geyser Bedrock Crossplay Status: {$geyserStatus}
- Simple Voice Chat Status: {$voiceStatus}
- ALL Installed Plugins ({$pluginCount} total): {$pluginsList}

{$matchedSection}

MINECRAFT SERVER & PLUGIN KNOWLEDGE BASE:
1. ViaVersion / ViaBackwards / ViaRewind:
   - "ViaVersion": Allows newer Minecraft client versions to connect to an older server (e.g. 1.21.x client joining a 1.20 server).
   - "ViaBackwards": Allows older Minecraft client versions to connect to a newer server (e.g. 1.16 client joining a 1.21 server).
   - "ViaRewind": Allows 1.7 / 1.8 clients to join 1.9+ servers.
   - Version checking: Inspect the exact filename in the list (e.g. "ViaVersion-5.2.1.jar" means version 5.2.1 is installed). The active stable release branch is 5.5.x+. If installed version is 5.2.x, inform the user they have 5.2.1 and that version 5.5.x+ is available for newer Minecraft releases.
2. Crossplay & Bedrock:
   - "GeyserMC" + "Floodgate": Allows Bedrock players (iOS, Android, Xbox, PlayStation, Switch, Windows Bedrock) to join Java Edition servers without purchasing a Java account.
3. Voice Chat:
   - "Simple Voice Chat" (voicechat): Proximity voice chat that requires a separate UDP port from allocations.
4. Essential Administration & Optimization:
   - "LuckPerms": Modern permissions manager.
   - "EssentialsX": Player commands (/spawn, /home, /tpa, /sethome, economy).
   - "CoreProtect": Block logging, rollbacks (/co inspect, /co rollback).
   - "FastAsyncWorldEdit" (FAWE) / "WorldEdit": World manipulation.
   - "Chunky": World pre-generation to eliminate chunk generation lag.
   - "Spark": CPU and tick profiler for performance debugging.

STRICT ACTION EXECUTION RULES (CRITICAL):
- ONLY output an action if the user EXPLICITLY ordered you to perform it (e.g. "restart the server", "setup geyser", "install voice chat", "optimize my server").
- If the user is asking a QUESTION, checking status or versions, asking for recommendations, or having a conversation: You MUST set "action": "none"! NEVER trigger setup, installation, or reboot actions when the user is only asking a question!

RESPONSE RULES:
- DIRECTLY answer the user using the concrete plugin files and versions listed above.
- NEVER claim a plugin is not installed if it is present in the "ALL Installed Plugins" or "MATCHED PLUGINS" list.
- Answer in friendly, precise, and professional English.

Always output a JSON object with EXACTLY this structure:
{
  "thought": "Internal reasoning in 1 sentence",
  "message": "Clear, friendly, detailed response for the user",
  "action": "One of: restart_server, start_server, stop_server, setup_geyser, setup_voicechat, optimize_server, edit_config, run_command, none",
  "action_params": {
     "command": "command string if run_command",
     "file": "path if edit_config",
     "key": "setting key",
     "value": "setting value"
  }
}
SYS;

            $messages = [
                ['role' => 'system', 'content' => $systemPrompt],
            ];

            // Append recent history (last 12 messages from the past 5 minutes)
            $recentHistory = array_slice($history, -12);
            foreach ($recentHistory as $h) {
                if (isset($h['role'], $h['content']) && in_array($h['role'], ['user', 'assistant'])) {
                    $messages[] = [
                        'role' => $h['role'],
                        'content' => is_string($h['content']) ? $h['content'] : json_encode($h['content']),
                    ];
                }
            }

            $messages[] = ['role' => 'user', 'content' => $message];

            $aiRaw = $this->callGroqAi($messages, true);
            $parsed = json_decode($aiRaw, true);

            if (!$parsed) {
                $parsed = [
                    'thought' => 'Processed user query',
                    'message' => $aiRaw ?: "I'm ready to help you manage and optimize your server! Let me know what you need.",
                    'action' => 'none',
                    'action_params' => [],
                ];
            }

            // Execute action if specified AND strictly verified against user request
            $actionResult = null;
            $actionName = $parsed['action'] ?? 'none';
            $actionParams = $parsed['action_params'] ?? [];

            if ($actionName !== 'none') {
                if ($this->shouldExecuteAction($message, $actionName)) {
                    $actionResult = $this->executeAiAction($server, $actionName, $actionParams);
                } else {
                    // Suppress unsolicited hallucinated actions
                    Log::info("[AIAssistant] Suppressed unauthorized action '{$actionName}' for message: '{$message}'");
                    $actionName = 'none';
                    $actionParams = [];
                }
            }

            return response()->json([
                'success' => true,
                'thought' => $parsed['thought'] ?? '',
                'message' => $parsed['message'] ?? '',
                'action' => $actionName,
                'action_params' => $actionParams,
                'action_result' => $actionResult,
            ]);
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Chat Exception: " . $e->getMessage() . "\n" . $e->getTraceAsString());
            return response()->json([
                'success' => false,
                'message' => 'AI processing error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Executes actions dispatched by the AI chat
     */
    private function executeAiAction(Server $server, string $action, array $params): array
    {
        try {
            switch ($action) {
                case 'start_server':
                    $this->powerRepository->setServer($server)->send('start');
                    return ['success' => true, 'text' => 'Server start command dispatched.'];

                case 'restart_server':
                    $this->powerRepository->setServer($server)->send('restart');
                    return ['success' => true, 'text' => 'Server restart initiated.'];

                case 'stop_server':
                    $this->powerRepository->setServer($server)->send('stop');
                    return ['success' => true, 'text' => 'Server stop signal sent.'];

                case 'run_command':
                    $cmd = trim((string) ($params['command'] ?? ''));
                    if (!empty($cmd)) {
                        $this->commandRepository->setServer($server)->send($cmd);
                        return ['success' => true, 'text' => "Executed command: /{$cmd}"];
                    }
                    return ['success' => false, 'text' => 'Empty command provided.'];

                case 'setup_geyser':
                    return $this->performSetupGeyser($server);

                case 'setup_voicechat':
                    return $this->performSetupVoicechat($server);

                case 'optimize_server':
                    $this->applyStandardOptimizations($server);
                    return ['success' => true, 'text' => 'Lag-reduction optimizations applied to configs.'];

                case 'edit_config':
                    $file = $params['file'] ?? '/server.properties';
                    $key = $params['key'] ?? '';
                    $val = $params['value'] ?? '';
                    if ($key !== '') {
                        $this->updateServerPropertiesKey($server, $key, (string) $val);
                        return ['success' => true, 'text' => "Updated {$key} to {$val} in {$file}"];
                    }
                    return ['success' => false, 'text' => 'No key specified for config edit.'];

                default:
                    return ['success' => false, 'text' => "Action '{$action}' handled without execution."];
            }
        } catch (Throwable $e) {
            return ['success' => false, 'text' => 'Execution error: ' . $e->getMessage()];
        }
    }

    /**
     * Automated setup for GeyserMC & Floodgate
     */
    private function performSetupGeyser(Server $server): array
    {
        $allocations = $this->getServerAllocations($server);
        // Find secondary port
        $extraAlloc = null;
        foreach ($allocations as $a) {
            if (!$a['is_default']) {
                $extraAlloc = $a;
                break;
            }
        }

        $port = $extraAlloc ? $extraAlloc['port'] : ($allocations[0]['port'] ?? 19132);
        $ip = $extraAlloc ? ($extraAlloc['alias'] ?: $extraAlloc['ip']) : ($allocations[0]['ip'] ?? '0.0.0.0');

        // Download Geyser and Floodgate jars
        try {
            $geyserUrl = 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot';
            $floodgateUrl = 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot';

            $gRes = $this->httpClient->get($geyserUrl);
            if ($gRes->getStatusCode() === 200) {
                $this->fileRepository->setServer($server)->putContent('/plugins/Geyser-Spigot.jar', $gRes->getBody()->getContents());
            }

            $fRes = $this->httpClient->get($floodgateUrl);
            if ($fRes->getStatusCode() === 200) {
                $this->fileRepository->setServer($server)->putContent('/plugins/Floodgate-Spigot.jar', $fRes->getBody()->getContents());
            }

            // Create/update Geyser config folder
            $geyserConfig = <<<YAML
bedrock:
  address: 0.0.0.0
  port: {$port}
  clone-remote-port: false
remote:
  address: 127.0.0.1
  port: 25565
  auth-type: floodgate
YAML;
            try {
                $this->fileRepository->setServer($server)->putContent('/plugins/Geyser-Spigot/config.yml', $geyserConfig);
            } catch (Throwable $e) {}

            // Restart server to initialize
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => "GeyserMC & Floodgate installed! Bedrock port bound to {$port}. Server restarting. Connect via IP: {$ip} Port: {$port}",
                'port' => $port,
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'text' => "Geyser setup failed: " . $e->getMessage(),
            ];
        }
    }

    /**
     * Automated setup for Simple Voice Chat
     */
    private function performSetupVoicechat(Server $server): array
    {
        $allocations = $this->getServerAllocations($server);
        $extraAlloc = null;
        foreach ($allocations as $a) {
            if (!$a['is_default']) {
                $extraAlloc = $a;
                break;
            }
        }

        $port = $extraAlloc ? $extraAlloc['port'] : ($allocations[0]['port'] ?? 24454);

        $voiceConfig = "port={$port}\nbind_address=0.0.0.0\nforce_voice_chat=false\n";
        try {
            $this->fileRepository->setServer($server)->putContent('/plugins/voicechat/voicechat-server.properties', $voiceConfig);
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => "Configured Simple Voice Chat to port {$port} and restarted server.",
                'port' => $port,
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'text' => "Voicechat setup failed: " . $e->getMessage(),
            ];
        }
    }

    /**
     * Calls Groq API with structured JSON response
     */
    private function callGroqAi(array $messages, bool $jsonMode = true): string
    {
        $apiKey = env('GROQ_API_KEY');
        if (empty($apiKey) && file_exists(base_path('.env'))) {
            $envContent = file_get_contents(base_path('.env'));
            if (preg_match('/^GROQ_API_KEY=(.*)$/m', $envContent, $m)) {
                $apiKey = trim(trim($m[1]), " \"'");
            }
        }

        if (empty($apiKey)) {
            Log::warning("[AIAssistant] GROQ_API_KEY is not configured in .env");
            return json_encode([
                'thought' => 'API key missing',
                'message' => 'GROQ_API_KEY is not set in your panel .env file. Please set GROQ_API_KEY in /var/www/pterodactyl/.env and run php artisan config:clear.',
                'action' => 'none',
                'action_params' => [],
            ]);
        }

        $model = $this->getGroqModel();

        $body = [
            'model' => $model,
            'messages' => $messages,
            'temperature' => 0.2,
            'max_tokens' => 1024,
        ];

        if ($jsonMode) {
            $body['response_format'] = ['type' => 'json_object'];
        }

        try {
            $response = $this->httpClient->post('https://api.groq.com/openai/v1/chat/completions', [
                'headers' => [
                    'Authorization' => 'Bearer ' . $apiKey,
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ],
                'json' => $body,
            ]);

            $status = $response->getStatusCode();
            $raw = $response->getBody()->getContents();

            if ($status !== 200) {
                Log::error("[AIAssistant] Groq API returned status {$status}: {$raw}");
                $errData = json_decode($raw, true);
                if (!empty($errData['error']['failed_generation'])) {
                    return json_encode([
                        'thought' => 'Analyzing server information',
                        'message' => $errData['error']['failed_generation'],
                        'action' => 'none',
                        'action_params' => [],
                    ]);
                }
                return '';
            }

            $data = json_decode($raw, true);
            return $data['choices'][0]['message']['content'] ?? '';
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Groq HTTP Exception: " . $e->getMessage());
            return '';
        }
    }

    /**
     * Extracts relevant error logs from latest.log or crash-reports
     */
    private function extractRelevantLogs(Server $server): array
    {
        $raw = '';
        $source = 'logs/latest.log';

        // 1. Check crash reports first
        try {
            $crashFiles = $this->fileRepository->setServer($server)->getDirectory('/crash-reports');
            if (!empty($crashFiles) && is_array($crashFiles)) {
                // Get most recent file
                $latestCrash = end($crashFiles);
                $crashName = $latestCrash['name'] ?? '';
                if (!empty($crashName)) {
                    $raw = $this->fileRepository->setServer($server)->getContent("/crash-reports/{$crashName}");
                    $source = "crash-reports/{$crashName}";
                }
            }
        } catch (Throwable $e) {}

        // 2. Fallback to logs/latest.log
        if (empty($raw)) {
            try {
                $raw = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
                $source = 'logs/latest.log';
            } catch (Throwable $e) {}
        }

        if (empty($raw)) {
            return ['raw' => '', 'filtered' => '', 'snippet' => '', 'source' => 'none'];
        }

        $lines = explode("\n", str_replace("\r", '', $raw));
        $totalLines = count($lines);

        // Filter lines to keep errors, warnings, exceptions, and stack traces
        $filtered = [];
        $errorKeywords = ['error', 'warn', 'exception', 'caused by', 'failed', 'fatal', 'crash', 'cannot', 'eula', 'bind', 'stopping server'];

        for ($i = max(0, $totalLines - 150); $i < $totalLines; $i++) {
            $line = $lines[$i];
            $lower = strtolower($line);
            foreach ($errorKeywords as $kw) {
                if (str_contains($lower, $kw)) {
                    $filtered[] = $line;
                    break;
                }
            }
        }

        // If no specific error keywords matched, grab the last 40 lines
        if (count($filtered) < 5) {
            $filtered = array_slice($lines, -40);
        } else {
            $filtered = array_slice($filtered, -50);
        }

        $filteredText = implode("\n", $filtered);
        $snippet = implode("\n", array_slice($lines, -25));

        return [
            'raw' => $raw,
            'filtered' => $filteredText,
            'snippet' => $snippet,
            'source' => $source,
        ];
    }

    /**
     * Retrieve all server allocations
     */
    private function getServerAllocations(Server $server): array
    {
        try {
            return $server->allocations()->get()->map(function ($alloc) use ($server) {
                return [
                    'id' => $alloc->id,
                    'ip' => $alloc->ip,
                    'alias' => $alloc->ip_alias,
                    'port' => $alloc->port,
                    'is_default' => ($alloc->id === $server->allocation_id),
                ];
            })->toArray();
        } catch (Throwable $e) {
            return [];
        }
    }

    /**
     * Retrieve list of installed plugin jar filenames with caching and daemon resilience
     */
    private function getInstalledPlugins(Server $server): array
    {
        $cacheKey = "server_{$server->id}_installed_plugins";
        try {
            $files = $this->fileRepository->setServer($server)->getDirectory('/plugins');
            $plugins = [];
            foreach ($files as $f) {
                $name = $f['name'] ?? '';
                if (empty($name) || str_starts_with($name, '.')) {
                    continue;
                }
                if (preg_match('/\.(jar|zip)$/i', $name)) {
                    $plugins[] = $name;
                } elseif (!empty($f['directory']) || !empty($f['is_directory']) || (isset($f['file']) && !$f['file'])) {
                    $plugins[] = "{$name} (folder)";
                }
            }
            if (!empty($plugins)) {
                Cache::put($cacheKey, $plugins, now()->addMinutes(15));
            }
            return $plugins;
        } catch (Throwable $e) {
            Log::warning("[AIAssistant] Could not read /plugins from daemon: " . $e->getMessage());
            // Fallback to cached plugins if Wings daemon was temporarily unreachable
            $cached = Cache::get($cacheKey);
            if (is_array($cached) && !empty($cached)) {
                return $cached;
            }
            return [];
        }
    }

    /**
     * Find plugins matching keywords or common aliases in user query
     */
    private function findRelevantPlugins(string $query, array $plugins): array
    {
        $queryLower = strtolower($query);
        $matches = [];

        $aliases = [
            'via' => ['viaversion', 'viabackwards', 'viarewind'],
            'viaversion' => ['viaversion'],
            'viabackward' => ['viabackwards'],
            'viabackwards' => ['viabackwards'],
            'lp' => ['luckperms'],
            'luckperms' => ['luckperms'],
            'ess' => ['essentials', 'essentialsx'],
            'essentials' => ['essentials', 'essentialsx'],
            'geyser' => ['geyser', 'floodgate'],
            'floodgate' => ['floodgate'],
            'bedrock' => ['geyser', 'floodgate'],
            'voice' => ['voicechat', 'plasmovoice', 'simplevoicechat'],
            'voicechat' => ['voicechat', 'plasmovoice'],
            'coreprotect' => ['coreprotect'],
            'co' => ['coreprotect'],
            'worldedit' => ['worldedit', 'fastasyncworldedit', 'fawe'],
            'fawe' => ['fastasyncworldedit', 'worldedit'],
            'vault' => ['vault'],
            'protocollib' => ['protocollib'],
            'cmi' => ['cmi'],
            'chunky' => ['chunky'],
            'discordsrv' => ['discordsrv'],
            'spark' => ['spark'],
            'multiverse' => ['multiverse-core', 'multiverse'],
            'authme' => ['authme', 'authmereloaded'],
            'skinsrestorer' => ['skinsrestorer'],
            'clearlag' => ['clearlag'],
            'placeholderapi' => ['placeholderapi', 'papi'],
            'papi' => ['placeholderapi'],
            'dynmap' => ['dynmap', 'bluemap'],
            'bluemap' => ['bluemap', 'dynmap'],
        ];

        $tokens = preg_split('/[\s,\?!\._\-]+/', $queryLower);
        foreach ($plugins as $pluginFile) {
            $pFileLower = strtolower($pluginFile);
            foreach ($tokens as $tok) {
                if (strlen($tok) >= 3 && str_contains($pFileLower, $tok)) {
                    $matches[] = $pluginFile;
                    continue 2;
                }
                if (isset($aliases[$tok])) {
                    foreach ($aliases[$tok] as $target) {
                        if (str_contains($pFileLower, $target)) {
                            $matches[] = $pluginFile;
                            continue 2;
                        }
                    }
                }
            }
        }

        return array_values(array_unique($matches));
    }

    /**
     * Strict verification to prevent AI from executing actions unless the user explicitly requested it.
     */
    private function shouldExecuteAction(string $userMessage, string $action): bool
    {
        $msg = strtolower($userMessage);

        switch ($action) {
            case 'start_server':
                return preg_match('/\b(start|boot up|turn on)\b/', $msg) === 1;

            case 'restart_server':
                return preg_match('/\b(restart|reboot)\b/', $msg) === 1;

            case 'stop_server':
                return preg_match('/\b(stop|shutdown|turn off|kill)\b/', $msg) === 1;

            case 'setup_geyser':
                $hasName = str_contains($msg, 'geyser') || str_contains($msg, 'bedrock');
                $hasIntent = preg_match('/\b(install|setup|set up|add|enable|configure|download)\b/', $msg) === 1;
                return $hasName && $hasIntent;

            case 'setup_voicechat':
                $hasName = str_contains($msg, 'voice') || str_contains($msg, 'voicechat');
                $hasIntent = preg_match('/\b(install|setup|set up|add|enable|configure|download)\b/', $msg) === 1;
                return $hasName && $hasIntent;

            case 'optimize_server':
                return preg_match('/\b(optimize|reduce lag|fix lag|boost fps|improve performance|apply optimizations)\b/', $msg) === 1;

            case 'edit_config':
                return preg_match('/\b(change|set|edit|update|modify|switch)\b/', $msg) === 1;

            case 'run_command':
                return preg_match('/\b(run|execute|send|dispatch)\b/', $msg) === 1 && (str_contains($msg, 'command') || str_contains($msg, '/'));

            default:
                return false;
        }
    }

    /**
     * Resolves the configured Groq model with .env fallback
     */
    private function getGroqModel(): string
    {
        $model = env('GROQ_MODEL');
        if (empty($model) && file_exists(base_path('.env'))) {
            $envContent = file_get_contents(base_path('.env'));
            if (preg_match('/^GROQ_MODEL=(.*)$/m', $envContent, $m)) {
                $model = trim(trim($m[1]), " \"'");
            }
        }
        return !empty($model) ? $model : self::DEFAULT_MODEL;
    }

    /**
     * Updates or inserts a key in server.properties
     */
    private function updateServerPropertiesKey(Server $server, string $key, string $value): void
    {
        $content = '';
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/server.properties');
        } catch (Throwable $e) {}

        $lines = explode("\n", $content);
        $found = false;
        $newLines = [];

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if (str_starts_with($trimmed, "{$key}=") || str_starts_with($trimmed, "{$key} =")) {
                $newLines[] = "{$key}={$value}";
                $found = true;
            } else {
                $newLines[] = $line;
            }
        }

        if (!$found) {
            $newLines[] = "{$key}={$value}";
        }

        $this->fileRepository->setServer($server)->putContent('/server.properties', implode("\n", $newLines));
    }

    /**
     * Applies standard Paper/Purpur/Spigot lag reduction settings
     */
    private function applyStandardOptimizations(Server $server): void
    {
        // 1. server.properties adjustments
        $this->updateServerPropertiesKey($server, 'view-distance', '6');
        $this->updateServerPropertiesKey($server, 'simulation-distance', '4');
        $this->updateServerPropertiesKey($server, 'network-compression-threshold', '256');

        // 2. spigot.yml adjustments if exists
        try {
            $spigot = $this->fileRepository->setServer($server)->getContent('/spigot.yml');
            if (!empty($spigot)) {
                $spigot = preg_replace('/view-distance:\s*\d+/', 'view-distance: 6', $spigot);
                $this->fileRepository->setServer($server)->putContent('/spigot.yml', $spigot);
            }
        } catch (Throwable $e) {}
    }
}
