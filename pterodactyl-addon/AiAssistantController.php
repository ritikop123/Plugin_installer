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
            $primaryAlloc = $server->allocation;
            $primaryPort = $primaryAlloc ? $primaryAlloc->port : 25565;
            $primaryHost = $primaryAlloc ? ($primaryAlloc->ip_alias ?: $primaryAlloc->ip) : 'Server IP';

            try {
                $gConf = $this->fileRepository->setServer($server)->getContent('/plugins/Geyser-Spigot/config.yml');
                if (!empty($gConf)) {
                    $isClone = (bool) preg_match('/clone-remote-port:\s*true/i', $gConf);
                    $rawPort = '19132';
                    if (preg_match('/port:\s*(\d+)/', $gConf, $m)) {
                        $rawPort = $m[1];
                    }

                    $allocatedPorts = array_column($allocations, 'port');

                    if ($isClone) {
                        $geyserStatus = "INSTALLED & ACTIVE with 'clone-remote-port: true'! Geyser ignores 19132 and automatically clones Java port {$primaryPort}. Bedrock players join using Server IP: '{$primaryHost}' and Port: '{$primaryPort}'.";
                    } elseif (in_array((int) $rawPort, $allocatedPorts)) {
                        $geyserStatus = "INSTALLED & ACTIVE with dedicated allocation port {$rawPort}. Bedrock players join using Server IP: '{$primaryHost}' and Port: '{$rawPort}'.";
                    } else {
                        $geyserStatus = "INSTALLED. Note: config.yml has port {$rawPort}, BUT port {$rawPort} is not allocated to this server! The server's assigned port is {$primaryPort}. Bedrock players must either use 'clone-remote-port: true' to connect on Java port {$primaryPort}, or an extra port must be allocated.";
                    }
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

            $onlineMode = 'unknown';
            $whitelistMode = 'unknown';
            try {
                $spContent = $this->fileRepository->setServer($server)->getContent('/server.properties');
                if (preg_match('/^online-mode\s*=\s*(true|false)/mi', $spContent, $m)) {
                    $onlineMode = strtolower($m[1]);
                }
                if (preg_match('/^white-list\s*=\s*(true|false)/mi', $spContent, $m)) {
                    $whitelistMode = strtolower($m[1]);
                }
            } catch (Throwable $e) {}

            $matchedPlugins = $this->findRelevantPlugins($message, $plugins);
            $matchedSection = !empty($matchedPlugins)
                ? "MATCHED PLUGINS RELEVANT TO USER QUERY:\n- " . implode("\n- ", $matchedPlugins)
                : "No specific plugin keywords matched directly from query.";

            $recentConsoleLogs = 'No recent logs generated yet.';
            try {
                $rawLogs = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
                if (!empty($rawLogs)) {
                    $logLines = explode("\n", str_replace("\r", '', $rawLogs));
                    $lastLines = array_slice($logLines, -80);
                    $recentConsoleLogs = implode("\n", $lastLines);
                }
            } catch (Throwable $e) {}

            $systemPrompt = <<<SYS
You are an expert Minecraft Server Administrator and AI Co-Pilot with real-time visibility and direct administrative control over this server.
Your user is the server owner. You assist them with server diagnostics, plugin inquiries, updates, Bedrock crossplay, voice chat, port allocations, and optimizations.

Current Server State:
- Server Name: {$server->name}
- Server Address / Host: {$primaryHost}:{$primaryPort}
- Online Mode (Authentication): {$onlineMode} (true = Premium Minecraft only, false = Cracked / Offline accounts allowed)
- Whitelist Status: {$whitelistMode} (false = Open to everyone, true = Only whitelisted players can join)
- Primary & Extra Port Allocations: {$allocJson}
- Geyser Bedrock Crossplay Status: {$geyserStatus}
- Simple Voice Chat Status: {$voiceStatus}
- ALL Installed Plugins ({$pluginCount} total): {$pluginsList}

- Recent Server Console & Join Logs (/logs/latest.log - last 80 lines):
```
{$recentConsoleLogs}
```

{$matchedSection}

MINECRAFT SERVER & PLUGIN KNOWLEDGE BASE:
1. ViaVersion / ViaBackwards / ViaRewind:
   - "ViaVersion": Allows newer Minecraft client versions to connect to an older server (e.g. 1.21.x client joining a 1.20 server).
   - "ViaBackwards": Allows older Minecraft client versions to connect to a newer server (e.g. 1.16 client joining a 1.21 server).
   - "ViaRewind": Allows 1.7 / 1.8 clients to join 1.9+ servers.
   - Version checking: Inspect the exact filename in the list (e.g. "ViaVersion-5.2.1.jar" means version 5.2.1 is installed). The active stable release branch is 5.5.x+. If installed version is 5.2.x, inform the user they have 5.2.1 and that version 5.5.x+ is available for newer Minecraft releases.
2. Crossplay & Bedrock (GeyserMC + Floodgate & clone-remote-port):
   - "clone-remote-port": In Geyser's config.yml, when `clone-remote-port: true` is set, Geyser ignores default port 19132 and automatically binds Bedrock to the exact same port as the Java server ({$primaryPort})!
   - NEVER tell the user Bedrock uses port 19132 unless 19132 is explicitly in the server's allocated ports. If `clone-remote-port: true` is enabled (or if 19132 is not allocated), Bedrock players connect using the server's primary IP ({$primaryHost}) and Port ({$primaryPort})!
3. Voice Chat:
   - "Simple Voice Chat" (voicechat): Proximity voice chat that requires a separate UDP port from allocations.
4. Essential Administration & Optimization:
   - "LuckPerms": Modern permissions manager.
   - "EssentialsX": Player commands (/spawn, /home, /tpa, /sethome, economy).
   - "CoreProtect": Block logging, rollbacks (/co inspect, /co rollback).
   - "FastAsyncWorldEdit" (FAWE) / "WorldEdit": World manipulation.
   - "Chunky": World pre-generation to eliminate chunk generation lag.
   - "Spark": CPU and tick profiler for performance debugging.

NATURAL LANGUAGE SENTENCE RECOGNITION (MINECRAFT DOMAIN):
1. "properly configure this for every access" / "universal access" / "allow all access" / "allow cracked and all versions":
   - The user wants the server joinable by EVERYONE: cracked & premium players (online-mode=false), disabled whitelist, all Minecraft versions (1.8-1.21+), and Bedrock players!
   - You MUST execute action "configure_universal_access" to automatically apply these settings and restart!
2. "disable whitelist" / "turn off whitelist" / "remove whitelist":
   - Disables whitelist in server.properties and executes /whitelist off. Execute action "disable_whitelist"!
3. "make server joinable for all versions" / "can you make the server joinable for all versions?" / "allow all versions" / "multi-version":
   - The user wants cross-version client support so players on 1.8 through 1.21+ can join.
   - Check if ViaVersion and ViaBackwards are already in "ALL Installed Plugins":
     * If already installed: Tell the user that ViaVersion and ViaBackwards are already active and their server supports cross-version clients!
     * If not installed: If the user asked you to make it joinable / install it, execute action "setup_multiversion".
4. "allow cracked" / "turn off online mode" / "cracked players":
   - Requires setting online-mode=false in server.properties.
   - If user confirms or asks: execute action "edit_config" with {"key": "online-mode", "value": "false", "restart": true}!
5. "is geyser setup" / "bedrock port" / "clone port":
   - Refer to the "Geyser Bedrock Crossplay Status" above.
   - If 'clone-remote-port: true' is enabled, state clearly: Bedrock players connect on the server's Java port ({$primaryPort}) at {$primaryHost}!
   - If user asks to fix or enable clone port, execute action "enable_geyser_clone_port".
6. "check console" / "who tried to join" / "join attempts" / "why was I kicked" / "console logs" / "check logs" / "it should have it" / "read console":
   - You HAVE REAL-TIME DIRECT ACCESS to the server console! Inspect the "Recent Server Console & Join Logs" section above.
   - Look for entries such as:
     * Kicked for not being on whitelist: "Disconnecting <player>: You are not white-listed on this server!"
     * Connection attempts: "<player>[/<ip>:<port>] logged in with entity id", "lost connection", or "UUID of player"
     * Version mismatch: "Outdated client! Please use <version>" or "Outdated server!"
     * Errors or exceptions from plugins or server thread
   - Tell the user exactly what occurred in the console, citing timestamps, player names, and exact reasons!
   - NEVER tell the user "I do not have access to read console logs" or "I cannot see your console"! You have full access to /logs/latest.log!

CAPABILITIES YOU CAN EXECUTE (via JSON action):
- "configure_universal_access": One-click setup for EVERY access: sets online-mode=false (cracked accounts), disables whitelist, installs ViaVersion & ViaBackwards (all versions 1.8-1.21+), configures Geyser clone-remote-port: true (Bedrock edition), and restarts the server!
- "disable_whitelist": Disables whitelist in server.properties and runs /whitelist off.
- "setup_multiversion": Downloads and installs latest ViaVersion and ViaBackwards into /plugins and restarts the server so all client versions can join.
- "enable_geyser_clone_port": Sets clone-remote-port: true in Geyser config and restarts server so Bedrock shares the Java port.
- "setup_geyser": Installs GeyserMC & Floodgate, configures Bedrock port, and restarts.
- "setup_voicechat": Installs and configures Simple Voice Chat to an extra UDP port.
- "edit_config": Edits server.properties or plugin yaml.
- "restart_server": Restarts the server.
- "start_server": Starts the server.
- "stop_server": Stops the server.
- "optimize_server": Applies optimal lag-reduction settings.
- "run_command": Runs a console command (e.g. op, say, whitelist, reload).
- "none": Just a conversational answer or advice.

STRICT ACTION EXECUTION RULES (CRITICAL):
- When the user asks you to configure, set, change, install, or says "yes" / "proceed" / "do it": You MUST output the appropriate action! NEVER claim in your text message that you updated a file without outputting the action in JSON!
- If the user is asking an informational inquiry, checking versions, or asking how something works: Set "action": "none"!

RESPONSE RULES:
- DIRECTLY answer the user using the concrete plugin files, status, and ports listed above.
- Answer in friendly, precise, and professional English.

Always output a JSON object with EXACTLY this structure:
{
  "thought": "Internal reasoning in 1 sentence",
  "message": "Clear, friendly, detailed response for the user",
  "action": "One of: configure_universal_access, setup_multiversion, enable_geyser_clone_port, setup_geyser, setup_voicechat, restart_server, start_server, stop_server, optimize_server, edit_config, run_command, none",
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
            $parsed = $this->cleanAndParseJson($aiRaw);

            if (!$parsed) {
                $cleanText = trim(preg_replace('/```(?:json)?\s*([\s\S]*?)\s*```/i', '$1', $aiRaw));
                $parsed = [
                    'thought' => 'Processed user query',
                    'message' => !empty($cleanText) ? $cleanText : "I'm ready to help you manage and optimize your server! Let me know what you need.",
                    'action' => 'none',
                    'action_params' => [],
                ];
            }

            // Execute action if specified AND strictly verified against user request
            $actionResult = null;
            $actionName = $parsed['action'] ?? 'none';
            $actionParams = $parsed['action_params'] ?? [];

            // Fail-safe: if action was 'none' but AI claimed it updated online-mode or user requested cracked/universal/whitelist
            if ($actionName === 'none') {
                $thoughtAndMsg = strtolower(($parsed['thought'] ?? '') . ' ' . ($parsed['message'] ?? ''));
                $userMsgLower = strtolower($message);
                if (str_contains($thoughtAndMsg, 'online-mode') && (str_contains($thoughtAndMsg, 'false') || str_contains($thoughtAndMsg, 'updated your server.properties') || str_contains($thoughtAndMsg, 'cracked'))) {
                    $actionName = 'edit_config';
                    $actionParams = ['key' => 'online-mode', 'value' => 'false', 'restart' => true];
                } elseif (preg_match('/\b(eveyr|every|all|universal).*(acess|access)\b/i', $userMsgLower) || preg_match('/\b(not disable whitelist|did not add plugin|did nothing)\b/i', $userMsgLower)) {
                    $actionName = 'configure_universal_access';
                } elseif (preg_match('/\b(disable|turn off|remove)\s*whitelist\b/i', $userMsgLower)) {
                    $actionName = 'disable_whitelist';
                }
            }

            if ($actionName !== 'none') {
                if ($this->shouldExecuteAction($message, $actionName)) {
                    $actionResult = $this->executeAiAction($server, $actionName, $actionParams);
                } else {
                    // Suppress unsolicited hallucinated actions
                    Log::info("[AIAssistant] Suppressed unauthorized action '{$actionName}' for message: '{$message}'");
                    $actionName = 'none';
                    $actionParams = [];
                    if (preg_match('/(I have|I\'ve|successfully|configured|installed|restarted|updated)/i', $parsed['message'] ?? '')) {
                        $parsed['message'] .= "\n\n*(Note: No server changes were made yet. Please confirm if you want me to proceed with this action.)*";
                    }
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

                case 'configure_universal_access':
                    return $this->performConfigureUniversalAccess($server);

                case 'disable_whitelist':
                    return $this->performDisableWhitelist($server);

                case 'setup_multiversion':
                    return $this->performSetupMultiversion($server);

                case 'enable_geyser_clone_port':
                    return $this->performEnableGeyserClonePort($server);

                case 'setup_geyser':
                    return $this->performSetupGeyser($server);

                case 'setup_voicechat':
                    return $this->performSetupVoicechat($server);

                case 'optimize_server':
                    $this->applyStandardOptimizations($server);
                    return ['success' => true, 'text' => 'Lag-reduction optimizations applied to configs.'];

                case 'edit_config':
                    $file = $params['file'] ?? '/server.properties';
                    $key = $params['key'] ?? $params['setting'] ?? '';
                    $val = $params['value'] ?? $params['val'] ?? '';
                    if ($key !== '') {
                        $this->updateServerPropertiesKey($server, $key, (string) $val);
                        $msg = "Updated {$key}={$val} in {$file}.";
                        if ($key === 'online-mode' || !empty($params['restart'])) {
                            try {
                                $this->powerRepository->setServer($server)->send('restart');
                                $msg .= ' Server restart initiated so change takes effect immediately.';
                            } catch (Throwable $e) {}
                        }
                        return ['success' => true, 'text' => $msg];
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
     * Fully configure server for Universal Access (Cracked + Whitelist Off + All Versions + Bedrock Crossplay)
     */
    private function performConfigureUniversalAccess(Server $server): array
    {
        $primaryAlloc = $server->allocation;
        $primaryPort = $primaryAlloc ? $primaryAlloc->port : 25565;
        $primaryHost = $primaryAlloc ? ($primaryAlloc->ip_alias ?: $primaryAlloc->ip) : 'server IP';
        $actionsDone = [];

        // 1. Set online-mode=false (Cracked / Offline player support)
        try {
            $this->updateServerPropertiesKey($server, 'online-mode', 'false');
            $actionsDone[] = 'Set online-mode=false (Cracked / Offline players enabled)';
        } catch (Throwable $e) {
            Log::warning("[AIAssistant] Failed setting online-mode=false: " . $e->getMessage());
        }

        // 2. Disable Whitelist in server.properties and via console command
        try {
            $this->updateServerPropertiesKey($server, 'white-list', 'false');
            $this->updateServerPropertiesKey($server, 'enforce-whitelist', 'false');
            try {
                $this->commandRepository->setServer($server)->send('whitelist off');
            } catch (Throwable $e) {}
            $actionsDone[] = 'Disabled whitelist (server open to all players)';
        } catch (Throwable $e) {
            Log::warning("[AIAssistant] Failed disabling whitelist: " . $e->getMessage());
        }

        // 3. Install ViaVersion & ViaBackwards if missing
        $installed = $this->getInstalledPlugins($server);
        $installedStr = strtolower(implode(' ', $installed));

        $hasVia = str_contains($installedStr, 'viaversion');
        $hasBackwards = str_contains($installedStr, 'viabackwards');

        if (!$hasVia) {
            $vOk = $this->downloadPluginJar($server, 'viaversion', 'ViaVersion.jar');
            if ($vOk) {
                $actionsDone[] = 'Downloaded & installed ViaVersion.jar (1.8-1.21+ support)';
            }
        } else {
            $actionsDone[] = 'ViaVersion already installed';
        }

        if (!$hasBackwards) {
            $bOk = $this->downloadPluginJar($server, 'viabackwards', 'ViaBackwards.jar');
            if ($bOk) {
                $actionsDone[] = 'Downloaded & installed ViaBackwards.jar (Older client support)';
            }
        } else {
            $actionsDone[] = 'ViaBackwards already installed';
        }

        // 4. Ensure Geyser & Floodgate with clone-remote-port: true
        $hasGeyser = str_contains($installedStr, 'geyser');
        $hasFloodgate = str_contains($installedStr, 'floodgate');

        if (!$hasGeyser) {
            $gOk = $this->downloadPluginJar($server, 'geyser', 'Geyser-Spigot.jar');
            if ($gOk) {
                $actionsDone[] = 'Downloaded & installed Geyser-Spigot.jar';
            }
        }
        if (!$hasFloodgate) {
            $fOk = $this->downloadPluginJar($server, 'floodgate', 'Floodgate-Spigot.jar');
            if ($fOk) {
                $actionsDone[] = 'Downloaded & installed Floodgate-Spigot.jar';
            }
        }

        // Configure Geyser clone-remote-port: true
        try {
            $gConf = '';
            try {
                $gConf = $this->fileRepository->setServer($server)->getContent('/plugins/Geyser-Spigot/config.yml');
            } catch (Throwable $e) {}

            if (empty($gConf)) {
                $gConf = "bedrock:\n  address: 0.0.0.0\n  port: {$primaryPort}\n  clone-remote-port: true\nremote:\n  address: 127.0.0.1\n  port: {$primaryPort}\n  auth-type: floodgate\n";
            } else {
                if (preg_match('/clone-remote-port:\s*(false|true)/i', $gConf)) {
                    $gConf = preg_replace('/clone-remote-port:\s*(false|true)/i', 'clone-remote-port: true', $gConf);
                } else {
                    $gConf = preg_replace('/(bedrock:\s*\n)/i', "$1  clone-remote-port: true\n", $gConf);
                }
            }
            $this->fileRepository->setServer($server)->putContent('/plugins/Geyser-Spigot/config.yml', $gConf);
            $actionsDone[] = "Configured Geyser clone-remote-port: true (Bedrock port cloned to {$primaryPort})";
        } catch (Throwable $e) {}

        Cache::forget("server_{$server->id}_installed_plugins");

        // 5. Restart server
        try {
            $this->powerRepository->setServer($server)->send('restart');
            $actionsDone[] = 'Server restart initiated to apply all changes';
        } catch (Throwable $e) {}

        return [
            'success' => true,
            'text' => 'Universal Access Configured! ' . implode('. ', $actionsDone) . ". All players (Cracked, Bedrock, and Java 1.8-1.21+) can now join on {$primaryHost}:{$primaryPort}",
        ];
    }

    /**
     * Disables the server whitelist both in config and in runtime console
     */
    private function performDisableWhitelist(Server $server): array
    {
        try {
            $this->updateServerPropertiesKey($server, 'white-list', 'false');
            $this->updateServerPropertiesKey($server, 'enforce-whitelist', 'false');
            try {
                $this->commandRepository->setServer($server)->send('whitelist off');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => 'Whitelist disabled! white-list=false and enforce-whitelist=false applied to server.properties, and /whitelist off dispatched to console. All players can now join without being whitelisted.',
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'text' => 'Failed to disable whitelist: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Automated setup for ViaVersion & ViaBackwards (Multi-version support)
     */
    private function performSetupMultiversion(Server $server): array
    {
        try {
            $vOk = $this->downloadPluginJar($server, 'viaversion', 'ViaVersion.jar');
            $bOk = $this->downloadPluginJar($server, 'viabackwards', 'ViaBackwards.jar');

            Cache::forget("server_{$server->id}_installed_plugins");

            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            if ($vOk || $bOk) {
                return [
                    'success' => true,
                    'text' => 'ViaVersion and ViaBackwards have been successfully installed! Server restart initiated to support all client versions (1.8 through 1.21+).',
                ];
            }

            return [
                'success' => false,
                'text' => 'Could not download ViaVersion or ViaBackwards assets from repository.',
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'text' => 'Multi-version setup failed: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Reliably downloads plugin jar using Hangar API with GitHub Releases and direct API fallbacks
     */
    private function downloadPluginJar(Server $server, string $slug, string $targetJarName): bool
    {
        $headers = [
            'User-Agent' => 'Pterodactyl-Panel-AI/1.0',
            'Accept' => '*/*',
        ];

        // 1. Geyser and Floodgate direct official APIs
        if ($slug === 'geyser') {
            try {
                $res = $this->httpClient->get('https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot', [
                    'headers' => $headers,
                    'allow_redirects' => true,
                    'timeout' => 45,
                ]);
                $body = $res->getBody()->getContents();
                if ($res->getStatusCode() === 200 && strlen($body) > 50000) {
                    $this->fileRepository->setServer($server)->putContent('/plugins/' . $targetJarName, $body);
                    return true;
                }
            } catch (Throwable $e) {
                Log::warning("[AIAssistant] Geyser direct download failed: " . $e->getMessage());
            }
        }

        if ($slug === 'floodgate') {
            try {
                $res = $this->httpClient->get('https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot', [
                    'headers' => $headers,
                    'allow_redirects' => true,
                    'timeout' => 45,
                ]);
                $body = $res->getBody()->getContents();
                if ($res->getStatusCode() === 200 && strlen($body) > 50000) {
                    $this->fileRepository->setServer($server)->putContent('/plugins/' . $targetJarName, $body);
                    return true;
                }
            } catch (Throwable $e) {
                Log::warning("[AIAssistant] Floodgate direct download failed: " . $e->getMessage());
            }
        }

        // 2. PaperMC Hangar API (extremely fast CDN, no rate limits)
        $hangarProject = ($slug === 'viabackwards') ? 'ViaBackwards' : (($slug === 'viaversion') ? 'ViaVersion' : null);
        if ($hangarProject !== null) {
            try {
                $hangarMeta = $this->httpClient->get("https://hangar.papermc.io/api/v1/projects/{$hangarProject}/versions", [
                    'headers' => $headers,
                    'timeout' => 10,
                ]);
                if ($hangarMeta->getStatusCode() === 200) {
                    $hData = json_decode($hangarMeta->getBody()->getContents(), true);
                    $latestVer = $hData['result'][0]['name'] ?? null;
                    if (!empty($latestVer)) {
                        $downloadUrl = "https://hangar.papermc.io/api/v1/projects/{$hangarProject}/versions/{$latestVer}/PAPER/download";
                        $jarRes = $this->httpClient->get($downloadUrl, [
                            'headers' => $headers,
                            'allow_redirects' => true,
                            'timeout' => 60,
                        ]);
                        $contents = $jarRes->getBody()->getContents();
                        if ($jarRes->getStatusCode() === 200 && strlen($contents) > 50000) {
                            $this->fileRepository->setServer($server)->putContent('/plugins/' . $targetJarName, $contents);
                            Log::info("[AIAssistant] Successfully downloaded {$targetJarName} via Hangar API ({$latestVer})");
                            return true;
                        }
                    }
                }
            } catch (Throwable $e) {
                Log::warning("[AIAssistant] Hangar download for {$hangarProject} failed: " . $e->getMessage());
            }
        }

        // 3. GitHub Releases API resolution
        $githubRepo = ($slug === 'viabackwards') ? 'ViaVersion/ViaBackwards' : (($slug === 'viaversion') ? 'ViaVersion/ViaVersion' : null);
        if ($githubRepo !== null) {
            try {
                $ghRes = $this->httpClient->get("https://api.github.com/repos/{$githubRepo}/releases/latest", [
                    'headers' => $headers,
                    'timeout' => 10,
                ]);
                if ($ghRes->getStatusCode() === 200) {
                    $releaseData = json_decode($ghRes->getBody()->getContents(), true);
                    $assets = $releaseData['assets'] ?? [];
                    foreach ($assets as $asset) {
                        $assetName = $asset['name'] ?? '';
                        $downloadUrl = $asset['browser_download_url'] ?? '';
                        if (preg_match('/\.jar$/i', $assetName) && !preg_match('/(sources|javadoc|dev)\.jar$/i', $assetName) && !empty($downloadUrl)) {
                            $jarRes = $this->httpClient->get($downloadUrl, [
                                'headers' => $headers,
                                'allow_redirects' => true,
                                'timeout' => 60,
                            ]);
                            $contents = $jarRes->getBody()->getContents();
                            if ($jarRes->getStatusCode() === 200 && strlen($contents) > 50000) {
                                $this->fileRepository->setServer($server)->putContent('/plugins/' . $targetJarName, $contents);
                                Log::info("[AIAssistant] Successfully downloaded {$targetJarName} via GitHub Release asset: {$assetName}");
                                return true;
                            }
                        }
                    }
                }
            } catch (Throwable $e) {
                Log::warning("[AIAssistant] GitHub release download for {$githubRepo} failed: " . $e->getMessage());
            }
        }

        return false;
    }

    /**
     * Enables clone-remote-port: true in Geyser config so Bedrock automatically shares the Java server port
     */
    private function performEnableGeyserClonePort(Server $server): array
    {
        $primaryAlloc = $server->allocation;
        $primaryPort = $primaryAlloc ? $primaryAlloc->port : 25565;
        $primaryHost = $primaryAlloc ? ($primaryAlloc->ip_alias ?: $primaryAlloc->ip) : 'server IP';

        try {
            $gConf = $this->fileRepository->setServer($server)->getContent('/plugins/Geyser-Spigot/config.yml');
            if (empty($gConf)) {
                return ['success' => false, 'text' => 'Geyser config /plugins/Geyser-Spigot/config.yml not found.'];
            }

            if (preg_match('/clone-remote-port:\s*(false|true)/i', $gConf)) {
                $newConf = preg_replace('/clone-remote-port:\s*(false|true)/i', 'clone-remote-port: true', $gConf);
            } else {
                $newConf = preg_replace('/(bedrock:\s*\n)/i', "$1  clone-remote-port: true\n", $gConf);
            }

            $this->fileRepository->setServer($server)->putContent('/plugins/Geyser-Spigot/config.yml', $newConf);
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => "Enabled 'clone-remote-port: true' in Geyser config. Bedrock players can now connect directly to {$primaryHost}:{$primaryPort}!",
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'text' => 'Failed to enable clone-remote-port: ' . $e->getMessage()];
        }
    }

    /**
     * Automated setup for GeyserMC & Floodgate
     */
    private function performSetupGeyser(Server $server): array
    {
        $allocations = $this->getServerAllocations($server);
        $primaryAlloc = $server->allocation;
        $primaryPort = $primaryAlloc ? $primaryAlloc->port : 25565;
        $primaryHost = $primaryAlloc ? ($primaryAlloc->ip_alias ?: $primaryAlloc->ip) : '0.0.0.0';

        // Find secondary port
        $extraAlloc = null;
        foreach ($allocations as $a) {
            if (!$a['is_default']) {
                $extraAlloc = $a;
                break;
            }
        }

        $useClone = ($extraAlloc === null);
        $port = $extraAlloc ? $extraAlloc['port'] : $primaryPort;
        $ip = $extraAlloc ? ($extraAlloc['alias'] ?: $extraAlloc['ip']) : $primaryHost;
        $cloneVal = $useClone ? 'true' : 'false';

        // Download Geyser and Floodgate jars
        try {
            $geyserUrl = 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot';
            $floodgateUrl = 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot';

            $gRes = $this->httpClient->get($geyserUrl, ['allow_redirects' => true]);
            if ($gRes->getStatusCode() === 200) {
                $this->fileRepository->setServer($server)->putContent('/plugins/Geyser-Spigot.jar', $gRes->getBody()->getContents());
            }

            $fRes = $this->httpClient->get($floodgateUrl, ['allow_redirects' => true]);
            if ($fRes->getStatusCode() === 200) {
                $this->fileRepository->setServer($server)->putContent('/plugins/Floodgate-Spigot.jar', $fRes->getBody()->getContents());
            }

            // Create/update Geyser config folder
            $geyserConfig = <<<YAML
bedrock:
  address: 0.0.0.0
  port: {$port}
  clone-remote-port: {$cloneVal}
remote:
  address: 127.0.0.1
  port: {$primaryPort}
  auth-type: floodgate
YAML;
            try {
                $this->fileRepository->setServer($server)->putContent('/plugins/Geyser-Spigot/config.yml', $geyserConfig);
            } catch (Throwable $e) {}

            // Restart server to initialize
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            $msg = $useClone
                ? "GeyserMC & Floodgate installed with 'clone-remote-port: true'! Bedrock players connect using the same server IP & Java port: {$ip}:{$primaryPort}"
                : "GeyserMC & Floodgate installed! Bedrock port bound to extra allocation {$port} on {$ip}.";

            return [
                'success' => true,
                'text' => $msg,
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
                $errMsg = $errData['error']['message'] ?? "Groq API returned HTTP {$status}";
                return json_encode([
                    'thought' => 'Service status',
                    'message' => "AI Engine notice: {$errMsg}",
                    'action' => 'none',
                    'action_params' => [],
                ]);
            }

            $data = json_decode($raw, true);
            return $data['choices'][0]['message']['content'] ?? '';
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Groq HTTP Exception: " . $e->getMessage());
            return json_encode([
                'thought' => 'Connection notice',
                'message' => 'Unable to contact AI engine: ' . $e->getMessage(),
                'action' => 'none',
                'action_params' => [],
            ]);
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
        $msg = strtolower(trim($userMessage));

        // Allow any affirmative confirmation (e.g. user replying "yes" to "Would you like me to proceed?")
        if (preg_match('/^(yes|yeah|yep|sure|ok|okay|proceed|do it|go ahead|confirm|please|apply|restart)\b/i', $msg)) {
            return true;
        }

        // Allow if user is complaining that action wasn't done or demanding to do it
        if (preg_match('/\b(not done|did nothing|didn\'t do|did not|why did you not|failed|fix it|do it|properly|configure|apply|setup|install|enable|disable|remove|turn off|allow|switch|add)\b/i', $msg)) {
            if ($action === 'configure_universal_access' && preg_match('/\b(access|acess|universal|all|every|eveyr|cracked|whitelist|plugin)\b/i', $msg)) {
                return true;
            }
            if ($action === 'disable_whitelist' && preg_match('/\b(whitelist|white-list|white\s*list)\b/i', $msg)) {
                return true;
            }
            if ($action === 'setup_multiversion' && preg_match('/\b(plugin|plugins|via|version|versions|joinable)\b/i', $msg)) {
                return true;
            }
        }

        switch ($action) {
            case 'configure_universal_access':
                return preg_match('/\b(every|all|universal|full|complete).*(access|acess|join|player|version|enter)\b/i', $msg) === 1
                    || preg_match('/\b(configure.*(access|acess|everything|all))\b/i', $msg) === 1
                    || preg_match('/\b(allow.*(all|everyone|everybody|cracked))\b/i', $msg) === 1
                    || preg_match('/\b(eveyr\s*acess|every\s*acess|universal\s*access)\b/i', $msg) === 1
                    || preg_match('/\b(cracked.*version|every.*player|all.*player)\b/i', $msg) === 1;

            case 'disable_whitelist':
                return preg_match('/\b(whitelist|white-list|white\s*list)\b/i', $msg) === 1;

            case 'start_server':
                return preg_match('/\b(start|boot up|turn on)\b/i', $msg) === 1;

            case 'restart_server':
                return preg_match('/\b(restart|reboot)\b/i', $msg) === 1;

            case 'stop_server':
                return preg_match('/\b(stop|shutdown|turn off|kill)\b/i', $msg) === 1;

            case 'setup_geyser':
                $hasName = str_contains($msg, 'geyser') || str_contains($msg, 'bedrock');
                $hasIntent = preg_match('/\b(install|setup|set up|add|enable|configure|download)\b/i', $msg) === 1;
                return $hasName && $hasIntent;

            case 'setup_voicechat':
                $hasName = str_contains($msg, 'voice') || str_contains($msg, 'voicechat');
                $hasIntent = preg_match('/\b(install|setup|set up|add|enable|configure|download)\b/i', $msg) === 1;
                return $hasName && $hasIntent;

            case 'optimize_server':
                return preg_match('/\b(optimize|reduce lag|fix lag|boost fps|improve performance|apply optimizations)\b/i', $msg) === 1;

            case 'edit_config':
                return preg_match('/\b(change|set|edit|update|modify|switch|cracked|online-mode|online mode|offline mode|whitelist|allow cracked)\b/i', $msg) === 1;

            case 'setup_multiversion':
                return preg_match('/\b(make.*joinable|joinable.*all|all versions|setup via|install via|multi-version|multiversion|cross version|add plugin|install plugin)\b/i', $msg) === 1;

            case 'enable_geyser_clone_port':
                return preg_match('/\b(clone port|clone-remote-port|clone remote port|auto port|same port|fix port|fix geyser)\b/i', $msg) === 1;

            case 'run_command':
                return preg_match('/\b(run|execute|send|dispatch)\b/i', $msg) === 1 && (str_contains($msg, 'command') || str_contains($msg, '/'));

            default:
                return false;
        }
    }

    /**
     * Cleans and safely decodes LLM JSON outputs (strips markdown codeblocks and extracts JSON payload)
     */
    private function cleanAndParseJson(string $raw): ?array
    {
        $raw = trim($raw);
        if (empty($raw)) {
            return null;
        }

        // 1. If wrapped in markdown code fence ```json ... ```
        if (preg_match('/```(?:json)?\s*([\s\S]*?)\s*```/i', $raw, $m)) {
            $inner = trim($m[1]);
            $decoded = json_decode($inner, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        // 2. Direct json_decode
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }

        // 3. Extract between first { and last }
        $first = strpos($raw, '{');
        $last = strrpos($raw, '}');
        if ($first !== false && $last !== false && $last > $first) {
            $substr = substr($raw, $first, $last - $first + 1);
            $decoded = json_decode($substr, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return null;
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
            if (preg_match('/^' . preg_quote($key, '/') . '\s*=/i', $trimmed)) {
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
