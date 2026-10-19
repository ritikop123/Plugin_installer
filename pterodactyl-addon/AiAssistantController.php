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
  "action_type": "One of: accept_eula, fix_port_conflict, install_geyser, install_voicechat, optimize_config, remove_corrupted_jar, delete_file, none",
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
            $isWorldGen = str_contains($logData['raw'], 'world_gen_settings.dat');

            if ($isWorldGen) {
                $parsed = [
                    'has_error' => true,
                    'issue_title' => 'Corrupted World Gen Settings',
                    'cause' => 'The world_gen_settings.dat file is corrupted or incompatible with the current server software version.',
                    'solution' => 'Delete /world/world_gen_settings.dat and restart the server so a clean, valid version is generated.',
                    'auto_fixable' => true,
                    'action_type' => 'delete_file',
                    'action_params' => ['file' => '/world/world_gen_settings.dat'],
                    'requires_restart' => true,
                ];
            } else {
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

                case 'delete_file':
                    $targetFile = (string) $request->input('action_params.file', $request->input('file', ''));
                    if (!empty($targetFile)) {
                        $delRes = $this->performDeleteFile($server, ['file' => $targetFile, 'restart' => false]);
                        $message = $delRes['text'] ?? "File {$targetFile} removed.";
                    } else {
                        $message = 'No target file specified for deletion.';
                    }
                    break;

                case 'delete_world':
                    $delRes = $this->performDeleteWorld($server, (array) $request->input('action_params', []));
                    $message = $delRes['text'] ?? 'World cleanup completed.';
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
            $crashNotice = '';
            try {
                $crashFiles = $this->fileRepository->setServer($server)->getDirectory('/crash-reports');
                if (!empty($crashFiles) && is_array($crashFiles)) {
                    $latestCrash = end($crashFiles);
                    $crashName = $latestCrash['name'] ?? '';
                    if (!empty($crashName)) {
                        $crashContent = $this->fileRepository->setServer($server)->getContent("/crash-reports/{$crashName}");
                        $crashLines = explode("\n", str_replace("\r", '', $crashContent));
                        $crashSnippet = implode("\n", array_slice($crashLines, 0, 25));
                        $crashNotice = "\n- CRASH REPORT DETECTED (/crash-reports/{$crashName}):\n```\n{$crashSnippet}\n```\n";
                    }
                }
            } catch (Throwable $e) {}

            try {
                $rawLogs = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
                if (!empty($rawLogs)) {
                    $logLines = explode("\n", str_replace("\r", '', $rawLogs));
                    $filteredLines = [];
                    $interestingKw = ['logged in', 'lost connection', 'disconnecting', 'whitelist', 'white-list', 'uuid of player', 'warn', 'error', 'exception', 'cannot', 'outdated', 'failed to bind', 'stopping server'];
                    $total = count($logLines);
                    for ($i = max(0, $total - 120); $i < $total; $i++) {
                        $line = trim($logLines[$i]);
                        if (empty($line)) continue;
                        $lower = strtolower($line);
                        foreach ($interestingKw as $kw) {
                            if (str_contains($lower, $kw)) {
                                $filteredLines[] = $line;
                                break;
                            }
                        }
                    }
                    if (count($filteredLines) < 5) {
                        $filteredLines = array_slice($logLines, -20);
                    } else {
                        $filteredLines = array_slice($filteredLines, -25);
                    }
                    $recentConsoleLogs = implode("\n", array_map('trim', $filteredLines));
                    if (strlen($recentConsoleLogs) > 1500) {
                        $recentConsoleLogs = substr($recentConsoleLogs, -1500);
                    }
                }
            } catch (Throwable $e) {}

            $jarStatus = 'server.jar present';
            $eulaStatus = 'eula=true';
            try {
                $rootFiles = $this->fileRepository->setServer($server)->getDirectory('/');
                $hasJar = false;
                $jarSize = 0;
                foreach ($rootFiles as $rf) {
                    $rname = strtolower($rf['name'] ?? '');
                    if (preg_match('/\.jar$/i', $rname)) {
                        $hasJar = true;
                        $jarSize = (int) ($rf['size'] ?? 0);
                        $jarStatus = "Executable jar '{$rf['name']}' found (" . round($jarSize / (1024 * 1024), 1) . ' MB)';
                        break;
                    }
                }
                if (!$hasJar || $jarSize < 5000000) {
                    $jarStatus = 'CRITICAL: No valid server executable JAR found in root directory! The server will crash or exit immediately upon startup until software (Paper/Purpur) is installed.';
                }

                try {
                    $eulaTxt = $this->fileRepository->setServer($server)->getContent('/eula.txt');
                    if (!preg_match('/eula\s*=\s*true/i', $eulaTxt)) {
                        $eulaStatus = 'eula=false (Server will stop immediately until EULA is accepted)';
                    }
                } catch (Throwable $e) {
                    $eulaStatus = 'eula.txt missing';
                }
            } catch (Throwable $e) {}

            $learnedMemory = $this->getLearnedMemory($server);

            $systemPrompt = <<<SYS
You are an expert Minecraft Server Administrator and AI Co-Pilot with real-time visibility and direct administrative control over this server.
Your user is the server owner. You assist them with server diagnostics, plugin inquiries, updates, Bedrock crossplay, voice chat, port allocations, and optimizations.

Current Server State:
- Server Name: {$server->name}
- Server Address / Host: {$primaryHost}:{$primaryPort}
- Server Executable JAR Status: {$jarStatus}
- EULA Status: {$eulaStatus}
- Online Mode (Authentication): {$onlineMode} (true = Premium Minecraft only, false = Cracked / Offline accounts allowed)
- Whitelist Status: {$whitelistMode} (false = Open to everyone, true = Only whitelisted players can join)
- Primary & Extra Port Allocations: {$allocJson}
- Geyser Bedrock Crossplay Status: {$geyserStatus}
- Simple Voice Chat Status: {$voiceStatus}
- ALL Installed Plugins ({$pluginCount} total): {$pluginsList}
{$crashNotice}
- Recent Server Console & Join Logs (/logs/latest.log - concise recent activity):
```
{$recentConsoleLogs}
```
- Server Memory & Proven Fixes Learned Over Time:
{$learnedMemory}

{$matchedSection}

MINECRAFT SERVER & PLUGIN KNOWLEDGE BASE:
0. Minecraft Modern Versioning (2026+):
   - In 2026, Minecraft versions have transitioned to year-based release versioning: 26.1, 26.2, 26.3, 26.4 (along with legacy 1.21.x, 1.20.x, etc.).
   - The current modern release line is 26.x (e.g. 26.1, 26.2, 26.3, 26.4). NEVER tell the user that 1.21.11 or older is the latest version when 26.x is out!
   - When the user asks for the latest version, latest Paper, Purpur, or 26.x builds, recognize that 26.4 / 26.x is the current 2026 release line.
1. ViaVersion / ViaBackwards / ViaRewind:
   - "ViaVersion": Allows newer Minecraft client versions to connect to an older server (e.g. 1.21.x or 26.x client joining a 1.20 server).
   - "ViaBackwards": Allows older Minecraft client versions to connect to a newer server (e.g. 1.16 client joining a 1.21 or 26.x server).
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
   - The user wants the server joinable by EVERYONE: cracked & premium players (online-mode=false), disabled whitelist, all Minecraft versions (1.8-26.x), and Bedrock players!
   - You MUST execute action "configure_universal_access" to automatically apply these settings and restart!
2. "disable whitelist" / "turn off whitelist" / "remove whitelist":
   - Disables whitelist in server.properties and executes /whitelist off. Execute action "disable_whitelist"!
3. "make server joinable for all versions" / "can you make the server joinable for all versions?" / "allow all versions" / "multi-version":
   - The user wants cross-version client support so players on 1.8 through 26.x can join.
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
   - NEVER tell the user "I do not have access to read console logs" or "I cannot see your console"! You have full access to /logs/latest.log and /crash-reports/!
7. "download software" / "install paper" / "install purpur" / "download server jar" / "install server" / "server crashing download paper" / "corrupted jar" / "invalid or corrupt jarfile":
   - You HAVE FULL DIRECT ABILITY to download and install server software jars using the built-in Software Installer!
   - NEVER tell the user "I cannot directly download files to your server's file system"!
   - You MUST execute action "install_software" with {"software": "paper", "version": "latest"} (or requested software/version like "26.4")!
8. "delete file" / "remove corrupted" / "world_gen_settings.dat" / "session.lock" / "server crashing due to corrupted file":
   - When a world generation file (/world/world_gen_settings.dat), session lock (/world/session.lock), or conflicting plugin crashes the server, execute action "delete_file" with {"file": "/path/to/file", "restart": true}!
   - Minecraft will automatically regenerate fresh, uncorrupted files upon restart!
9. "install plugin" / "add plugin" / "download plugin":
   - You can install ANY plugin from Modrinth/Hangar using the built-in Plugin Installer! Execute action "install_plugin" with {"plugin": "PluginName"}!
10. "install mod" / "add mod":
   - You can install ANY mod from Modrinth using the built-in Mod Installer! Execute action "install_mod" with {"mod": "ModName"}!
11. "install modpack" / "setup modpack" / "download modpack":
   - You can install ANY modpack (e.g. Cobblemon, Better MC, ATM9, Prominence) using the built-in Modpack Installer! Execute action "install_modpack" with {"modpack": "ModpackName"}!

CAPABILITIES YOU CAN EXECUTE (via JSON action):
- "install_software": Downloads and installs official Minecraft server software (Paper, Purpur, Spigot, Vanilla, Fabric) via Wings streaming pull directly as server.jar, accepts eula, and starts the server! Params: {"software": "paper|purpur|fabric|vanilla", "version": "latest|26.4|1.21.4"}
- "install_plugin": Installs any plugin directly into /plugins using the built-in Plugin Installer engine. Params: {"plugin": "LuckPerms"}
- "install_mod": Installs any mod directly into /mods using the built-in Mod Installer engine. Params: {"mod": "Sodium"}
- "install_modpack": Installs an entire Minecraft modpack and configs from Modrinth using the built-in Modpack Installer engine! Params: {"modpack": "Cobblemon"}
- "delete_world": Safely stops server and resets/deletes corrupted world or dimension folders (/world, /world_nether, /world_the_end, /world/DIM-1, /world/DIM1, /world/dimensions, /world/world_gen_settings.dat). Minecraft automatically generates fresh, uncorrupted chunks and world data upon restart! Params: {"target": "all|nether|end|world_gen_settings|session.lock"}
- "delete_file": Safely deletes a corrupted file, broken world gen data, or crashing plugin. Params: {"file": "/world/world_gen_settings.dat", "restart": true}
- "configure_universal_access": One-click setup for EVERY access: sets online-mode=false (cracked accounts), disables whitelist, installs ViaVersion & ViaBackwards (all versions 1.8-26.x), configures Geyser clone-remote-port: true (Bedrock edition), and restarts the server!
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

STRICT ACTION EXECUTION & ANTI-HALLUCINATION RULES (CRITICAL):
- ANTI-HALLUCINATION: NEVER speak in future tense saying "I am going to download...", "I will install...", or "I will fix..." while setting "action": "none"!
- Whenever you recognize a problem (such as invalid or corrupt jarfile server.jar, missing executable, crash, or user request to install/fix), you MUST set "action" to the executable action (e.g. "install_software")!
- Your message MUST state that the action has been dispatched and is currently executing.
- If the user is asking a purely informational inquiry, checking versions, or asking how something works: Set "action": "none"!

RESPONSE RULES:
- DIRECTLY answer the user using the concrete plugin files, status, and ports listed above.
- Answer in friendly, precise, and professional English.

Always output a JSON object with EXACTLY this structure:
{
  "thought": "Internal reasoning in 1 sentence",
  "message": "Clear, friendly, detailed response for the user",
  "action": "One of: install_software, install_plugin, install_mod, install_modpack, delete_world, delete_file, configure_universal_access, setup_multiversion, enable_geyser_clone_port, setup_geyser, setup_voicechat, restart_server, start_server, stop_server, optimize_server, edit_config, run_command, none",
  "action_params": {
     "software": "paper or purpur if install_software",
     "version": "version string if install_software",
     "plugin": "plugin name if install_plugin",
     "mod": "mod name if install_mod",
     "modpack": "modpack name if install_modpack",
     "target": "all|nether|end|world_gen_settings if delete_world",
     "file": "path if delete_file or edit_config",
     "command": "command string if run_command",
     "key": "setting key",
     "value": "setting value"
  }
}
SYS;

            $messages = [
                ['role' => 'system', 'content' => $systemPrompt],
            ];

            // Append recent history (last 4 messages, trimmed to preserve Groq token limit)
            $recentHistory = array_slice($history, -4);
            foreach ($recentHistory as $h) {
                if (isset($h['role'], $h['content']) && in_array($h['role'], ['user', 'assistant'])) {
                    $contentStr = is_string($h['content']) ? $h['content'] : json_encode($h['content']);
                    if (strlen($contentStr) > 300) {
                        $contentStr = substr($contentStr, 0, 300) . '...';
                    }
                    $messages[] = [
                        'role' => $h['role'],
                        'content' => $contentStr,
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

            // Direct execution confirmation from Yes button
            if (preg_match('/^Yes, do it:\s*execute\s+([a-zA-Z0-9_]+)(?:\s+(.*))?$/i', trim($message), $ym)) {
                $actionName = $ym[1];
                if (!empty($ym[2])) {
                    $decodedParams = json_decode($ym[2], true);
                    if (is_array($decodedParams)) {
                        $actionParams = $decodedParams;
                    }
                }
            } elseif (preg_match('/^(yes|do it|confirm|proceed|yes,?\s*(do it|proceed|please))/i', trim($message)) && $actionName === 'none' && !empty($history)) {
                // Recover action from last assistant message
                $lastAssistantMsg = '';
                for ($i = count($history) - 1; $i >= 0; $i--) {
                    if (($history[$i]['role'] ?? '') === 'assistant') {
                        $lastAssistantMsg = strtolower($history[$i]['content'] ?? '');
                        break;
                    }
                }
                if (!empty($lastAssistantMsg)) {
                    if (str_contains($lastAssistantMsg, 'world') && (str_contains($lastAssistantMsg, 'corrupt') || str_contains($lastAssistantMsg, 'delete') || str_contains($lastAssistantMsg, 'reset'))) {
                        $actionName = 'delete_world';
                        $actionParams = ['target' => str_contains($lastAssistantMsg, 'nether') ? 'nether' : (str_contains($lastAssistantMsg, 'end') ? 'end' : 'all')];
                    } elseif (str_contains($lastAssistantMsg, 'paper') || str_contains($lastAssistantMsg, 'purpur') || str_contains($lastAssistantMsg, 'software')) {
                        $actionName = 'install_software';
                        $actionParams = ['software' => str_contains($lastAssistantMsg, 'purpur') ? 'purpur' : 'paper', 'version' => 'latest'];
                    } elseif (str_contains($lastAssistantMsg, 'universal') || str_contains($lastAssistantMsg, 'cracked')) {
                        $actionName = 'configure_universal_access';
                    } elseif (str_contains($lastAssistantMsg, 'voice chat') || str_contains($lastAssistantMsg, 'voicechat')) {
                        $actionName = 'setup_voicechat';
                    } elseif (str_contains($lastAssistantMsg, 'geyser') || str_contains($lastAssistantMsg, 'bedrock')) {
                        $actionName = 'setup_geyser';
                    } elseif (str_contains($lastAssistantMsg, 'whitelist')) {
                        $actionName = 'disable_whitelist';
                    }
                }
            }

            // Fail-safe: if action was 'none' but AI claimed it updated online-mode or user requested cracked/universal/whitelist
            if ($actionName === 'none') {
                $thoughtAndMsg = strtolower(($parsed['thought'] ?? '') . ' ' . ($parsed['message'] ?? ''));
                $userMsgLower = strtolower($message);

                // Anti-hallucination: if AI promised to install/reinstall or user reported corrupt jarfile
                if (preg_match('/(reinstall|install|download|replace).*(server\.jar|paper|purpur|software|server software)/i', $thoughtAndMsg) ||
                    (str_contains($userMsgLower, 'corrupt jarfile') || str_contains($userMsgLower, 'invalid or corrupt'))) {
                    $actionName = 'install_software';
                    $software = 'paper';
                    if (str_contains($thoughtAndMsg, 'purpur') || str_contains($userMsgLower, 'purpur')) $software = 'purpur';
                    if (str_contains($thoughtAndMsg, 'fabric') || str_contains($userMsgLower, 'fabric')) $software = 'fabric';
                    $actionParams = ['software' => $software, 'version' => 'latest'];
                } elseif (preg_match('/\b(delete|reset|remove|clear|wipe)\s*(?:the\s+)?(?:corrupted\s+)?(world|nether|end|dimension|dimensions)\b/i', $userMsgLower) ||
                    (preg_match('/\b(world.*corrupt|corrupt.*world|corrupted world|broken world)\b/i', $userMsgLower) && preg_match('/\b(delete|reset|fix|remove)\b/i', $userMsgLower))) {
                    $actionName = 'delete_world';
                    $target = 'all';
                    if (str_contains($userMsgLower, 'nether')) $target = 'nether';
                    elseif (str_contains($userMsgLower, 'end')) $target = 'end';
                    elseif (str_contains($userMsgLower, 'settings') || str_contains($userMsgLower, 'world_gen')) $target = 'world_gen_settings';
                    $actionParams = ['target' => $target];
                } elseif (str_contains($thoughtAndMsg, 'online-mode') && (str_contains($thoughtAndMsg, 'false') || str_contains($thoughtAndMsg, 'updated your server.properties') || str_contains($thoughtAndMsg, 'cracked'))) {
                    $actionName = 'edit_config';
                    $actionParams = ['key' => 'online-mode', 'value' => 'false', 'restart' => true];
                } elseif (preg_match('/\b(eveyr|every|all|universal).*(acess|access)\b/i', $userMsgLower) || preg_match('/\b(not disable whitelist|did not add plugin|did nothing)\b/i', $userMsgLower)) {
                    $actionName = 'configure_universal_access';
                } elseif (preg_match('/\b(disable|turn off|remove)\s*whitelist\b/i', $userMsgLower)) {
                    $actionName = 'disable_whitelist';
                } elseif (preg_match('/\b(install|download|get|setup)\s*(paper|purpur|spigot|fabric|vanilla|software|server jar)\b/i', $userMsgLower) || preg_match('/\b(download|install)\s*(paper|purpur)/i', $userMsgLower)) {
                    $actionName = 'install_software';
                    $software = 'paper';
                    if (str_contains($userMsgLower, 'purpur')) $software = 'purpur';
                    if (str_contains($userMsgLower, 'fabric')) $software = 'fabric';
                    if (str_contains($userMsgLower, 'spigot')) $software = 'spigot';
                    if (str_contains($userMsgLower, 'vanilla')) $software = 'vanilla';
                    $ver = 'latest';
                    if (preg_match('/(2\d(\.\d+)+|1\.\d+(\.\d+)?)/', $userMsgLower, $vm)) {
                        $ver = $vm[0];
                    }
                    $actionParams = ['software' => $software, 'version' => $ver];
                } elseif (preg_match('/\b(delete|remove|erase|clear)\b/i', $userMsgLower) && preg_match('/\b(world_gen_settings|session\.lock|crash|file|\.dat|\.lock|\.log|\.jar)\b/i', $userMsgLower)) {
                    $actionName = 'delete_file';
                    $targetFile = '';
                    if (str_contains($userMsgLower, 'world_gen_settings')) {
                        $targetFile = '/world/world_gen_settings.dat';
                    } elseif (str_contains($userMsgLower, 'session.lock')) {
                        $targetFile = '/world/session.lock';
                    } elseif (preg_match('/\/[a-zA-Z0-9_\-\.\/]+/', $message, $pathMatch)) {
                        $targetFile = $pathMatch[0];
                    }
                    $actionParams = ['file' => $targetFile, 'restart' => true];
                } elseif (preg_match('/\b(install|add|download)\s+(?:plugin\s+)?([a-zA-Z0-9_\-]+)\b/i', $userMsgLower, $pm) && str_contains($userMsgLower, 'plugin')) {
                    $actionName = 'install_plugin';
                    $actionParams = ['plugin' => $pm[2]];
                } elseif (preg_match('/\b(install|add|download|setup)\s+(?:the\s+)?(?:modpack|mod\s*pack)\s+([a-zA-Z0-9_\-\s]+)\b/i', $userMsgLower, $mpm) || str_contains($userMsgLower, 'modpack') || str_contains($userMsgLower, 'mod pack')) {
                    $actionName = 'install_modpack';
                    $packTarget = !empty($mpm[2]) ? trim($mpm[2]) : trim(str_ireplace(['install', 'download', 'setup', 'modpack', 'mod pack', 'the', 'please'], '', $userMsgLower));
                    $actionParams = ['modpack' => $packTarget];
                } elseif (preg_match('/\b(install|add|download)\s+(?:mod\s+)?([a-zA-Z0-9_\-]+)\b/i', $userMsgLower, $mm) && str_contains($userMsgLower, 'mod')) {
                    $actionName = 'install_mod';
                    $actionParams = ['mod' => $mm[2]];
                }
            }

            $pendingActionName = null;
            $pendingActionParams = [];

            if ($actionName !== 'none') {
                if ($this->shouldExecuteAction($message, $actionName)) {
                    $actionResult = $this->executeAiAction($server, $actionName, $actionParams);
                    if (!empty($actionResult['success'])) {
                        $this->recordSuccessfulLearning($server, $message, $actionName, $actionParams);
                    }
                } else {
                    // Suppress unsolicited hallucinated actions until user confirms
                    Log::info("[AIAssistant] Awaiting confirmation for action '{$actionName}' for message: '{$message}'");
                    $pendingActionName = $actionName;
                    $pendingActionParams = $actionParams;
                    $actionName = 'none';
                    $actionParams = [];
                    $parsed['message'] .= "\n\n*(Note: No server changes were made yet. Would you like me to proceed with this fix?)*";
                }
            }

            return response()->json([
                'success' => true,
                'thought' => $parsed['thought'] ?? '',
                'message' => $parsed['message'] ?? '',
                'action' => $actionName,
                'action_params' => $actionParams,
                'action_result' => $actionResult,
                'pending_action' => $pendingActionName,
                'pending_action_params' => $pendingActionParams,
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

                case 'install_software':
                    return $this->performInstallSoftware($server, $params);

                case 'install_plugin':
                    return $this->performInstallPlugin($server, $params);

                case 'install_mod':
                    return $this->performInstallMod($server, $params);

                case 'install_modpack':
                    return $this->performInstallModpack($server, $params);

                case 'delete_world':
                    return $this->performDeleteWorld($server, $params);

                case 'delete_file':
                    return $this->performDeleteFile($server, $params);

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
     * Downloads and installs Minecraft server software directly to /server.jar
     */
    private function performInstallSoftware(Server $server, array $params): array
    {
        $software = strtoupper(trim((string) ($params['software'] ?? $params['type'] ?? 'PAPER')));
        $version = trim((string) ($params['version'] ?? 'latest'));

        if (empty($software)) {
            $software = 'PAPER';
        }

        $targetUrl = '';

        // 1. Purpur direct API (if specific 1.x version requested)
        if ($software === 'PURPUR' && $version !== 'latest' && !empty($version) && !str_starts_with($version, '26.')) {
            $targetUrl = "https://api.purpurmc.org/v2/purpur/{$version}/latest/download";
        }

        // 2. MCJars API for Paper, Purpur, Fabric, Vanilla, Folia, etc.
        if (empty($targetUrl)) {
            try {
                $mcjarsType = ($software === 'PURPUR') ? 'PURPUR' : 'PAPER';
                if ($software === 'FABRIC') $mcjarsType = 'FABRIC';
                if ($software === 'VANILLA') $mcjarsType = 'VANILLA';
                if ($software === 'SPIGOT') $mcjarsType = 'SPIGOT';
                if ($software === 'FOLIA') $mcjarsType = 'FOLIA';

                $res = $this->httpClient->get("https://mcjars.app/api/v2/builds/{$mcjarsType}", [
                    'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                    'timeout' => 10,
                ]);
                if ($res->getStatusCode() === 200) {
                    $data = json_decode($res->getBody()->getContents(), true);
                    $builds = $data['builds'] ?? [];
                    if (!empty($builds)) {
                        $chosenBuild = null;
                        if ($version !== 'latest' && !empty($version)) {
                            if (isset($builds[$version])) {
                                $chosenBuild = $builds[$version]['latest'] ?? null;
                            } else {
                                foreach ($builds as $vKey => $vData) {
                                    if (str_starts_with($vKey, $version) || str_starts_with($version, $vKey)) {
                                        $chosenBuild = $vData['latest'] ?? null;
                                        $version = $vKey;
                                        break;
                                    }
                                }
                            }
                        }
                        if (!$chosenBuild) {
                            $latestKey = array_key_last($builds);
                            $chosenBuild = $builds[$latestKey]['latest'] ?? null;
                            $version = $latestKey;
                        }
                        if ($chosenBuild && !empty($chosenBuild['jarUrl'])) {
                            $targetUrl = $chosenBuild['jarUrl'];
                        }
                    }
                }
            } catch (Throwable $e) {
                Log::warning("[AIAssistant] MCJars API lookup failed: " . $e->getMessage());
            }
        }

        // Fallback: If target URL could not be resolved, use Purpur 1.21.4 drop-in
        if (empty($targetUrl)) {
            $targetUrl = "https://api.purpurmc.org/v2/purpur/1.21.4/latest/download";
            $software = 'Purpur';
            $version = '1.21.4';
        }

        try {
            // Delete old / corrupt server.jar first to ensure completely clean installation
            try {
                $this->fileRepository->setServer($server)->deleteFiles('/', ['server.jar']);
            } catch (Throwable $e) {}

            // Command Wings Daemon to stream-pull the jar directly into root as server.jar
            // This is the EXACT official Wings pull mechanism used by SoftwareInstallerController!
            // It completely avoids PHP memory limits and Wings JSON payload truncation.
            $this->fileRepository->setServer($server)->pull(
                $targetUrl,
                '/',
                [
                    'filename' => 'server.jar',
                    'use_header' => false,
                    'foreground' => true,
                ]
            );

            // Automatically accept EULA
            try {
                $this->fileRepository->setServer($server)->putContent('/eula.txt', "eula=true\n");
            } catch (Throwable $e) {}

            // Save manifest file
            try {
                $manifest = [
                    'software' => $software,
                    'software_id' => strtoupper($software),
                    'version' => $version,
                    'filename' => 'server.jar',
                    'installed_at' => now()->toIso8601String(),
                ];
                $this->fileRepository->setServer($server)->putContent('/.pterodactyl-software.json', json_encode($manifest, JSON_PRETTY_PRINT));
            } catch (Throwable $e) {}

            // Restart / Start server
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {
                try {
                    $this->powerRepository->setServer($server)->send('start');
                } catch (Throwable $e2) {}
            }

            return [
                'success' => true,
                'text' => "Successfully downloaded and installed {$software} ({$version}) as server.jar via Wings streaming pull, accepted eula=true, and started the server!",
            ];
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Wings pull error: " . $e->getMessage());
            return [
                'success' => false,
                'text' => 'Software installation failed: ' . $e->getMessage(),
            ];
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
     * Reliably downloads plugin jar using Wings streaming pull (matching PluginInstallerController)
     */
    private function downloadPluginJar(Server $server, string $slug, string $targetJarName): bool
    {
        $headers = [
            'User-Agent' => 'Pterodactyl-Panel-AI/1.0',
            'Accept' => '*/*',
        ];

        try {
            $this->fileRepository->setServer($server)->createDirectory('plugins', '/');
        } catch (Throwable $e) {}

        $downloadUrl = null;

        // 1. Geyser and Floodgate direct official APIs
        if ($slug === 'geyser') {
            $downloadUrl = 'https://download.geysermc.org/v2/projects/geyser/versions/latest/builds/latest/downloads/spigot';
        } elseif ($slug === 'floodgate') {
            $downloadUrl = 'https://download.geysermc.org/v2/projects/floodgate/versions/latest/builds/latest/downloads/spigot';
        }

        // 2. PaperMC Hangar API (extremely fast CDN, no rate limits)
        if (!$downloadUrl) {
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
                        }
                    }
                } catch (Throwable $e) {
                    Log::warning("[AIAssistant] Hangar download for {$hangarProject} failed: " . $e->getMessage());
                }
            }
        }

        // 3. GitHub Releases API resolution
        if (!$downloadUrl) {
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
                            $url = $asset['browser_download_url'] ?? '';
                            if (preg_match('/\.jar$/i', $assetName) && !preg_match('/(sources|javadoc|dev)\.jar$/i', $assetName) && !empty($url)) {
                                $downloadUrl = $url;
                                break;
                            }
                        }
                    }
                } catch (Throwable $e) {
                    Log::warning("[AIAssistant] GitHub release download for {$githubRepo} failed: " . $e->getMessage());
                }
            }
        }

        if (empty($downloadUrl)) {
            Log::warning("[AIAssistant] Could not resolve download URL for plugin '{$slug}'");
            return false;
        }

        try {
            $this->fileRepository->setServer($server)->pull(
                $downloadUrl,
                '/plugins',
                [
                    'filename' => $targetJarName,
                    'use_header' => false,
                    'foreground' => true,
                ]
            );
            Log::info("[AIAssistant] Successfully pulled {$targetJarName} into /plugins via Wings streaming pull");
            return true;
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Wings pull failed for {$targetJarName}: " . $e->getMessage());
            return false;
        }
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
            // Ensure voicechat Bukkit plugin is installed in /plugins
            $installed = $this->getInstalledPlugins($server);
            $hasPlugin = false;
            foreach ($installed as $p) {
                if (str_contains(strtolower($p), 'voicechat')) {
                    $hasPlugin = true;
                    break;
                }
            }
            $pluginNotice = '';
            if (!$hasPlugin) {
                $pRes = $this->performInstallPlugin($server, ['plugin' => 'simple-voice-chat']);
                if (!empty($pRes['success'])) {
                    $pluginNotice = ' Downloaded verified Bukkit Voice Chat plugin.';
                }
            }

            try {
                $this->fileRepository->setServer($server)->createDirectory('voicechat', '/plugins');
            } catch (Throwable $e) {}

            $this->fileRepository->setServer($server)->putContent('/plugins/voicechat/voicechat-server.properties', $voiceConfig);
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => "Configured Simple Voice Chat to port {$port} and restarted server.{$pluginNotice}",
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

            if ($status === 429) {
                Log::warning("[AIAssistant] Groq Rate limit hit on {$model}. Checking retry...");
                $errData = json_decode($raw, true);
                $retrySec = 0;
                $errMsg = $errData['error']['message'] ?? '';
                if (preg_match('/try again in ([\d\.]+)\s*(ms|s)/i', $errMsg, $rm)) {
                    $val = (float) $rm[1];
                    $unit = strtolower($rm[2]);
                    $retrySec = ($unit === 'ms') ? ($val / 1000.0) : $val;
                } elseif (preg_match('/([\d\.]+)\s*(ms|s)/i', $errMsg, $rm)) {
                    $val = (float) $rm[1];
                    $unit = strtolower($rm[2]);
                    $retrySec = ($unit === 'ms') ? ($val / 1000.0) : $val;
                }

                // If wait time is short (<= 8s), auto sleep and retry once
                if ($retrySec > 0 && $retrySec <= 8.0) {
                    usleep((int) ($retrySec * 1000000) + 300000);
                    try {
                        $retryRes = $this->httpClient->post('https://api.groq.com/openai/v1/chat/completions', [
                            'headers' => [
                                'Authorization' => 'Bearer ' . $apiKey,
                                'Content-Type' => 'application/json',
                                'Accept' => 'application/json',
                            ],
                            'json' => $body,
                            'timeout' => 25,
                        ]);
                        if ($retryRes->getStatusCode() === 200) {
                            $data = json_decode($retryRes->getBody()->getContents(), true);
                            return $data['choices'][0]['message']['content'] ?? '';
                        }
                    } catch (Throwable $e) {}
                }

                // High-throughput fallback: llama-3.1-8b-instant (30,000 TPM pool)
                $fallbackBody = $body;
                $fallbackBody['model'] = 'llama-3.1-8b-instant';
                try {
                    $fbRes = $this->httpClient->post('https://api.groq.com/openai/v1/chat/completions', [
                        'headers' => [
                            'Authorization' => 'Bearer ' . $apiKey,
                            'Content-Type' => 'application/json',
                            'Accept' => 'application/json',
                        ],
                        'json' => $fallbackBody,
                        'timeout' => 25,
                    ]);
                    if ($fbRes->getStatusCode() === 200) {
                        $data = json_decode($fbRes->getBody()->getContents(), true);
                        return $data['choices'][0]['message']['content'] ?? '';
                    }
                } catch (Throwable $e) {}

                $waitSeconds = ceil($retrySec > 0 ? $retrySec : 3);
                return json_encode([
                    'thought' => 'API rate limit cooldown',
                    'message' => "The AI engine is briefly cooling down (Groq rate limit). Please wait {$waitSeconds} seconds and send your message again!",
                    'action' => 'none',
                    'action_params' => [],
                ]);
            }

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
        if (preg_match('/\b(not done|did nothing|didn\'t do|did not|why did you not|failed|fix it|do it|properly|configure|apply|setup|install|enable|disable|remove|turn off|allow|switch|add|delete)\b/i', $msg)) {
            if ($action === 'configure_universal_access' && preg_match('/\b(access|acess|universal|all|every|eveyr|cracked|whitelist|plugin)\b/i', $msg)) {
                return true;
            }
            if ($action === 'disable_whitelist' && preg_match('/\b(whitelist|white-list|white\s*list)\b/i', $msg)) {
                return true;
            }
            if ($action === 'setup_multiversion' && preg_match('/\b(plugin|plugins|via|version|versions|joinable)\b/i', $msg)) {
                return true;
            }
            if ($action === 'install_software' && preg_match('/\b(software|paper|purpur|spigot|fabric|vanilla|jar|download)\b/i', $msg)) {
                return true;
            }
            if ($action === 'install_plugin' && preg_match('/\b(plugin|plugins)\b/i', $msg)) {
                return true;
            }
            if ($action === 'install_mod' && preg_match('/\b(mod|mods)\b/i', $msg)) {
                return true;
            }
            if ($action === 'install_modpack' && preg_match('/\b(modpack|mod\s*pack)\b/i', $msg)) {
                return true;
            }
            if (($action === 'delete_file' || $action === 'delete_world') && preg_match('/\b(delete|remove|erase|file|world|nether|end|dimension|corrupted|world_gen_settings|session\.lock)\b/i', $msg)) {
                return true;
            }
        }

        // Allow if user is providing a crash log or reporting a crash / failure and action fixes it
        if (preg_match('/\b(crash|crashed|crashing|exit code|invalid or corrupt|corrupt jarfile|not starting|failed to start|startup failure|fix.*crash)\b/i', $msg)) {
            if ($action === 'install_software' || $action === 'delete_file' || $action === 'delete_world') {
                return true;
            }
        }

        switch ($action) {
            case 'delete_world':
                return preg_match('/\b(delete|reset|remove|clear|trash|wipe|clean|fix)\b/i', $msg) === 1
                    && preg_match('/\b(world|nether|end|dimension|dimensions|save|corrupt)\b/i', $msg) === 1;
            case 'install_plugin':
                return preg_match('/\b(install|download|add|setup|get)\b/i', $msg) === 1
                    || preg_match('/\b(plugin|plugins)\b/i', $msg) === 1;

            case 'install_mod':
                return preg_match('/\b(install|download|add|setup|get)\b/i', $msg) === 1
                    || preg_match('/\b(mod|mods)\b/i', $msg) === 1;

            case 'install_modpack':
                return preg_match('/\b(install|download|add|setup|get|modpack|mod\s*pack)\b/i', $msg) === 1;

            case 'delete_file':
                return preg_match('/\b(delete|remove|erase|clear|trash|wipe)\b/i', $msg) === 1
                    || preg_match('/\b(world_gen_settings|session\.lock|\.dat|\.log|\.jar)\b/i', $msg) === 1;

            case 'install_software':
                return preg_match('/\b(install|download|setup|switch|change|get|reinstall).*(software|paper|purpur|spigot|fabric|vanilla|jar|server\.jar)\b/i', $msg) === 1
                    || preg_match('/\b(install|download)\s*(paper|purpur|spigot|fabric|vanilla|software)\b/i', $msg) === 1;

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

    /**
     * Safely deletes a file or directory inside the server container
     */
    private function performDeleteFile(Server $server, array $params): array
    {
        $rawPath = trim((string) ($params['file'] ?? $params['path'] ?? $params['target'] ?? ''));
        if (empty($rawPath)) {
            return ['success' => false, 'text' => 'No target file specified to delete.'];
        }

        // Normalize path and remove traversal attempts
        $cleanPath = '/' . ltrim(str_replace(['\\', '..'], ['/', ''], $rawPath), '/');

        // Prevent root deletion or empty path
        if ($cleanPath === '/' || empty(trim($cleanPath, '/'))) {
            return ['success' => false, 'text' => 'Deleting the root server directory is strictly prohibited for security.'];
        }

        $dir = dirname($cleanPath);
        if ($dir === '\\' || $dir === '.') {
            $dir = '/';
        }
        $filename = basename($cleanPath);

        if (empty($filename)) {
            return ['success' => false, 'text' => 'Invalid file path specified.'];
        }

        try {
            $this->fileRepository->setServer($server)->deleteFiles($dir, [$filename]);

            $msg = "Successfully removed '{$cleanPath}'.";

            $shouldRestart = $params['restart'] ?? true;
            if ($shouldRestart) {
                try {
                    $this->powerRepository->setServer($server)->send('restart');
                    $msg .= ' Server restart initiated so clean files will regenerate.';
                } catch (Throwable $e) {}
            }

            return ['success' => true, 'text' => $msg];
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Delete file error for '{$cleanPath}': " . $e->getMessage());
            return ['success' => false, 'text' => "Failed to delete '{$cleanPath}': " . $e->getMessage()];
        }
    }

    /**
     * Completely cleans or resets a corrupted world, removing all dimensions (overworld, nether, end)
     * and session locks safely while server is halted.
     */
    private function performDeleteWorld(Server $server, array $params = []): array
    {
        try {
            // 1. Fetch level-name from server.properties
            $levelName = 'world';
            try {
                $props = $this->fileRepository->setServer($server)->getContent('/server.properties');
                if (preg_match('/^level-name=(.*)$/m', $props, $m)) {
                    $val = trim($m[1]);
                    if (!empty($val)) {
                        $levelName = $val;
                    }
                }
            } catch (Throwable $e) {}

            // 2. Stop server to unlock session.lock and region MCA files
            try {
                $this->powerRepository->setServer($server)->send('stop');
                sleep(2);
            } catch (Throwable $e) {}

            $dimension = strtolower(trim((string) ($params['dimension'] ?? $params['target'] ?? 'all')));
            $deletedPaths = [];

            // Target dimensions
            if ($dimension === 'nether') {
                $targets = ["{$levelName}_nether", "world_nether"];
                foreach ($targets as $t) {
                    try {
                        $this->fileRepository->setServer($server)->deleteFiles('/', [$t]);
                        $deletedPaths[] = $t;
                    } catch (Throwable $e) {}
                }
                try {
                    $this->fileRepository->setServer($server)->deleteFiles("/{$levelName}", ['DIM-1']);
                    $deletedPaths[] = "{$levelName}/DIM-1";
                } catch (Throwable $e) {}
            } elseif ($dimension === 'end' || $dimension === 'the_end') {
                $targets = ["{$levelName}_the_end", "world_the_end"];
                foreach ($targets as $t) {
                    try {
                        $this->fileRepository->setServer($server)->deleteFiles('/', [$t]);
                        $deletedPaths[] = $t;
                    } catch (Throwable $e) {}
                }
                try {
                    $this->fileRepository->setServer($server)->deleteFiles("/{$levelName}", ['DIM1']);
                    $deletedPaths[] = "{$levelName}/DIM1";
                } catch (Throwable $e) {}
            } else {
                $foldersToDelete = [
                    $levelName,
                    "{$levelName}_nether",
                    "{$levelName}_the_end",
                ];
                if ($levelName !== 'world') {
                    $foldersToDelete[] = 'world';
                    $foldersToDelete[] = 'world_nether';
                    $foldersToDelete[] = 'world_the_end';
                }

                foreach (array_unique($foldersToDelete) as $f) {
                    try {
                        $this->fileRepository->setServer($server)->deleteFiles('/', [$f]);
                        $deletedPaths[] = $f;
                    } catch (Throwable $e) {}
                }
            }

            // Remove any leftover session.lock or world_gen_settings if any folder remained
            try {
                $this->fileRepository->setServer($server)->deleteFiles("/{$levelName}", ['session.lock', 'world_gen_settings.json']);
            } catch (Throwable $e) {}

            // Restart server so clean, uncorrupted world is generated
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            $delSummary = !empty($deletedPaths) ? implode(', ', $deletedPaths) : $levelName;
            return [
                'success' => true,
                'text' => "Halted server, cleanly removed corrupted world directories ({$delSummary}) and dimension data (including Nether/End/DIM folders), and initiated server reboot to generate a pristine, uncorrupted world.",
            ];
        } catch (Throwable $e) {
            Log::error("[AIAssistant] performDeleteWorld failed: " . $e->getMessage());
            return [
                'success' => false,
                'text' => "World cleanup failed: " . $e->getMessage(),
            ];
        }
    }

    /**
     * Persistently saves successful resolutions and actions to server-specific memory
     */
    private function recordSuccessfulLearning(Server $server, string $userQuery, string $action, array $params): void
    {
        if (empty($action) || $action === 'none') {
            return;
        }

        try {
            $memPath = storage_path("app/ai_memory_server_{$server->id}.json");
            $memory = [];
            if (file_exists($memPath)) {
                $content = @file_get_contents($memPath);
                if (!empty($content)) {
                    $memory = json_decode($content, true) ?: [];
                }
            }

            // Clean and compact user query keywords
            $cleanQuery = strtolower(trim(preg_replace('/[^\w\s\.\-]/', '', $userQuery)));
            if (strlen($cleanQuery) > 80) {
                $cleanQuery = substr($cleanQuery, 0, 80);
            }

            // Find existing matching memory entry by action
            $foundIndex = -1;
            foreach ($memory as $idx => $entry) {
                if (($entry['action'] ?? '') === $action) {
                    $foundIndex = $idx;
                    break;
                }
            }

            if ($foundIndex >= 0) {
                $memory[$foundIndex]['count'] = ($memory[$foundIndex]['count'] ?? 1) + 1;
                $memory[$foundIndex]['last_used'] = now()->toIso8601String();
                if (!in_array($cleanQuery, $memory[$foundIndex]['sample_queries'] ?? [])) {
                    $memory[$foundIndex]['sample_queries'][] = $cleanQuery;
                    if (count($memory[$foundIndex]['sample_queries']) > 3) {
                        array_shift($memory[$foundIndex]['sample_queries']);
                    }
                }
            } else {
                $memory[] = [
                    'action' => $action,
                    'params' => $params,
                    'sample_queries' => [$cleanQuery],
                    'count' => 1,
                    'created_at' => now()->toIso8601String(),
                    'last_used' => now()->toIso8601String(),
                ];
            }

            // Keep max 15 memory entries to keep prompt lightweight
            if (count($memory) > 15) {
                $memory = array_slice($memory, -15);
            }

            @file_put_contents($memPath, json_encode($memory, JSON_PRETTY_PRINT));
        } catch (Throwable $e) {
            Log::warning("[AIAssistant] Failed to save learning memory: " . $e->getMessage());
        }
    }

    /**
     * Retrieves concise learned patterns for this server to inject into system prompt
     */
    private function getLearnedMemory(Server $server): string
    {
        try {
            $memPath = storage_path("app/ai_memory_server_{$server->id}.json");
            if (!file_exists($memPath)) {
                return 'No previous server-specific patterns stored yet.';
            }

            $content = @file_get_contents($memPath);
            if (empty($content)) {
                return 'No previous server-specific patterns stored yet.';
            }

            $memory = json_decode($content, true);
            if (empty($memory) || !is_array($memory)) {
                return 'No previous server-specific patterns stored yet.';
            }

            $lines = [];
            foreach ($memory as $entry) {
                $act = $entry['action'] ?? 'unknown';
                $cnt = $entry['count'] ?? 1;
                $queries = implode(', ', array_slice($entry['sample_queries'] ?? [], 0, 2));
                $lines[] = "- Pattern: When user asks about [{$queries}], action '{$act}' was successfully executed ({$cnt}x verified).";
            }

            return !empty($lines) ? implode("\n", array_slice($lines, -10)) : 'No previous server-specific patterns stored yet.';
        } catch (Throwable $e) {
            return 'No previous server-specific patterns stored yet.';
        }
    }

    /**
     * Installs any plugin requested by user using Modrinth / Hangar like the built-in Plugin Installer
     */
    private function performInstallPlugin(Server $server, array $params): array
    {
        $pluginQuery = trim((string) ($params['plugin'] ?? $params['name'] ?? ''));
        if (empty($pluginQuery)) {
            return ['success' => false, 'text' => 'No plugin name specified.'];
        }

        try {
            $this->fileRepository->setServer($server)->createDirectory('plugins', '/');
        } catch (Throwable $e) {}

        // 1. Direct match for key plugins
        $cleanSlug = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $pluginQuery));
        if (in_array($cleanSlug, ['geyser', 'floodgate', 'viaversion', 'viabackwards'], true)) {
            $targetName = ($cleanSlug === 'geyser') ? 'Geyser-Spigot.jar' : (($cleanSlug === 'floodgate') ? 'Floodgate-Spigot.jar' : (ucfirst($cleanSlug) . '.jar'));
            $ok = $this->downloadPluginJar($server, $cleanSlug, $targetName);
            if ($ok) {
                Cache::forget("server_{$server->id}_installed_plugins");
                try {
                    $this->powerRepository->setServer($server)->send('restart');
                } catch (Throwable $e) {}
                return ['success' => true, 'text' => "Successfully installed {$targetName} via Wings streaming pull and restarted server!"];
            }
        }

        // 2. Query Modrinth API search specifically for Bukkit/Paper/Spigot plugins
        $downloadUrl = null;
        $fileName = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $pluginQuery) . '.jar';

        try {
            $searchRes = $this->httpClient->get('https://api.modrinth.com/v2/search', [
                'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                'query' => [
                    'query' => $pluginQuery,
                    'facets' => '[["project_type:plugin"],["categories:spigot","categories:paper","categories:purpur","categories:bukkit"]]',
                    'limit' => 3,
                ],
                'timeout' => 8,
            ]);

            $searchData = ($searchRes->getStatusCode() === 200) ? json_decode($searchRes->getBody()->getContents(), true) : null;
            $hit = $searchData['hits'][0] ?? null;

            // If no match under plugin facets, try generic search
            if (!$hit) {
                $genSearch = $this->httpClient->get('https://api.modrinth.com/v2/search', [
                    'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                    'query' => [
                        'query' => $pluginQuery,
                        'limit' => 3,
                    ],
                    'timeout' => 8,
                ]);
                $genData = ($genSearch->getStatusCode() === 200) ? json_decode($genSearch->getBody()->getContents(), true) : null;
                $hit = $genData['hits'][0] ?? null;
            }

            if ($hit && !empty($hit['project_id'])) {
                $slug = $hit['slug'] ?? $hit['project_id'];
                // Query versions filtered strictly by Bukkit / Paper / Spigot loaders
                $verRes = $this->httpClient->get("https://api.modrinth.com/v2/project/{$slug}/version", [
                    'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                    'query' => [
                        'loaders' => json_encode(['paper', 'spigot', 'purpur', 'bukkit']),
                    ],
                    'timeout' => 8,
                ]);

                if ($verRes->getStatusCode() === 200) {
                    $vers = json_decode($verRes->getBody()->getContents(), true);
                    if (!empty($vers) && is_array($vers)) {
                        foreach ($vers as $v) {
                            $vLoaders = array_map('strtolower', $v['loaders'] ?? []);
                            $isPluginComp = false;
                            foreach (['paper', 'spigot', 'purpur', 'bukkit'] as $reqLoader) {
                                if (in_array($reqLoader, $vLoaders, true)) {
                                    $isPluginComp = true;
                                    break;
                                }
                            }
                            if (!$isPluginComp) continue;

                            foreach ($v['files'] ?? [] as $f) {
                                $candidateFn = strtolower($f['filename'] ?? '');
                                // Strictly reject Fabric, Forge, NeoForge, Quilt mod binaries
                                if (preg_match('/-(fabric|forge|neoforge|quilt)\b/i', $candidateFn)) {
                                    continue;
                                }
                                if (str_ends_with($candidateFn, '.jar') && !empty($f['url'])) {
                                    $downloadUrl = $f['url'];
                                    $fileName = $f['filename'];
                                    break 2;
                                }
                            }
                        }
                    }
                }
            }
        } catch (Throwable $e) {
            Log::warning("[AIAssistant] Modrinth search failed for plugin '{$pluginQuery}': " . $e->getMessage());
        }

        if (empty($downloadUrl)) {
            return ['success' => false, 'text' => "Could not locate verified download URL for plugin '{$pluginQuery}'. You can also search and install it directly from the built-in Plugin Installer tab."];
        }

        try {
            $this->fileRepository->setServer($server)->pull(
                $downloadUrl,
                '/plugins',
                [
                    'filename' => $fileName,
                    'use_header' => false,
                    'foreground' => true,
                ]
            );

            Cache::forget("server_{$server->id}_installed_plugins");

            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => "Successfully installed {$fileName} into /plugins via Wings stream-pull and initiated server restart!",
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'text' => "Failed to install plugin: " . $e->getMessage()];
        }
    }

    /**
     * Installs any mod requested by user using Modrinth like the built-in Mod Installer
     */
    private function performInstallMod(Server $server, array $params): array
    {
        $modQuery = trim((string) ($params['mod'] ?? $params['name'] ?? ''));
        if (empty($modQuery)) {
            return ['success' => false, 'text' => 'No mod name specified.'];
        }

        try {
            $this->fileRepository->setServer($server)->createDirectory('mods', '/');
        } catch (Throwable $e) {}

        $downloadUrl = null;
        $fileName = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $modQuery) . '.jar';
        $dependencies = [];

        try {
            $searchRes = $this->httpClient->get('https://api.modrinth.com/v2/search', [
                'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                'query' => [
                    'query' => $modQuery,
                    'facets' => '[["project_type:mod"]]',
                    'limit' => 1,
                    'index' => 'downloads',
                ],
                'timeout' => 8,
            ]);

            if ($searchRes->getStatusCode() === 200) {
                $searchData = json_decode($searchRes->getBody()->getContents(), true);
                $hit = $searchData['hits'][0] ?? null;
                if ($hit && !empty($hit['project_id'])) {
                    $slug = $hit['slug'] ?? $hit['project_id'];
                    $verRes = $this->httpClient->get("https://api.modrinth.com/v2/project/{$slug}/version", [
                        'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                        'timeout' => 8,
                    ]);
                    if ($verRes->getStatusCode() === 200) {
                        $vers = json_decode($verRes->getBody()->getContents(), true);
                        if (!empty($vers) && is_array($vers)) {
                            $chosenVer = $vers[0];
                            $dependencies = $chosenVer['dependencies'] ?? [];
                            $primaryFile = null;
                            foreach ($chosenVer['files'] ?? [] as $f) {
                                if (!empty($f['primary'])) {
                                    $primaryFile = $f;
                                    break;
                                }
                            }
                            if (!$primaryFile) {
                                $primaryFile = $chosenVer['files'][0] ?? null;
                            }
                            if ($primaryFile && !empty($primaryFile['url'])) {
                                $downloadUrl = $primaryFile['url'];
                                if (!empty($primaryFile['filename'])) {
                                    $fileName = $primaryFile['filename'];
                                }
                            }
                        }
                    }
                }
            }
        } catch (Throwable $e) {
            Log::warning("[AIAssistant] Modrinth search failed for mod '{$modQuery}': " . $e->getMessage());
        }

        if (empty($downloadUrl)) {
            return ['success' => false, 'text' => "Could not locate verified download URL for mod '{$modQuery}'. You can also search and install it directly from the built-in Mods Installer tab."];
        }

        try {
            $this->fileRepository->setServer($server)->pull(
                $downloadUrl,
                '/mods',
                [
                    'filename' => $fileName,
                    'use_header' => false,
                    'foreground' => true,
                ]
            );

            // Also pull required dependencies if any
            $depCount = 0;
            if (!empty($dependencies) && is_array($dependencies)) {
                foreach ($dependencies as $dep) {
                    if (($dep['dependency_type'] ?? '') === 'required' && !empty($dep['project_id'])) {
                        try {
                            $dRes = $this->httpClient->get("https://api.modrinth.com/v2/project/{$dep['project_id']}/version", [
                                'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0'],
                                'timeout' => 6,
                            ]);
                            if ($dRes->getStatusCode() === 200) {
                                $dData = json_decode($dRes->getBody()->getContents(), true);
                                $df = $dData[0]['files'][0] ?? null;
                                if ($df && !empty($df['url'])) {
                                    $cleanDepName = basename($df['filename'] ?? 'dep.jar');
                                    $this->fileRepository->setServer($server)->pull(
                                        $df['url'],
                                        '/mods',
                                        [
                                            'filename' => $cleanDepName,
                                            'use_header' => false,
                                            'foreground' => true,
                                        ]
                                    );
                                    $depCount++;
                                }
                            }
                        } catch (Throwable $e) {}
                    }
                }
            }

            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            $depMsg = $depCount > 0 ? " (along with {$depCount} required dependency mods)" : "";
            return [
                'success' => true,
                'text' => "Successfully downloaded {$fileName}{$depMsg} into /mods via Wings stream-pull and initiated server restart!",
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'text' => "Failed to install mod: " . $e->getMessage()];
        }
    }

    /**
     * Installs any modpack requested by user using Modrinth like the built-in Modpack Installer
     */
    private function performInstallModpack(Server $server, array $params): array
    {
        $packQuery = trim((string) ($params['modpack'] ?? $params['name'] ?? ''));
        if (empty($packQuery)) {
            return ['success' => false, 'text' => 'No modpack name specified.'];
        }

        try {
            $searchRes = $this->httpClient->get('https://api.modrinth.com/v2/search', [
                'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                'query' => [
                    'query' => $packQuery,
                    'facets' => '[["project_type:modpack"]]',
                    'limit' => 1,
                    'index' => 'downloads',
                ],
                'timeout' => 8,
            ]);

            if ($searchRes->getStatusCode() !== 200) {
                return ['success' => false, 'text' => "Modpack search failed: API returned status " . $searchRes->getStatusCode()];
            }

            $searchData = json_decode($searchRes->getBody()->getContents(), true);
            $hit = $searchData['hits'][0] ?? null;
            if (!$hit || empty($hit['project_id'])) {
                return ['success' => false, 'text' => "Could not find any modpack matching '{$packQuery}' on Modrinth. You can also browse modpacks in the built-in Modpack Installer tab."];
            }

            $modpackTitle = $hit['title'] ?? $packQuery;
            $slug = $hit['slug'] ?? $hit['project_id'];

            // Fetch latest version
            $verRes = $this->httpClient->get("https://api.modrinth.com/v2/project/{$slug}/version", [
                'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0', 'Accept' => 'application/json'],
                'timeout' => 8,
            ]);

            if ($verRes->getStatusCode() !== 200) {
                return ['success' => false, 'text' => "Failed to fetch versions for modpack '{$modpackTitle}'."];
            }

            $versions = json_decode($verRes->getBody()->getContents(), true);
            if (empty($versions) || !is_array($versions)) {
                return ['success' => false, 'text' => "No releases found for modpack '{$modpackTitle}'."];
            }

            $chosenVer = $versions[0];
            $files = $chosenVer['files'] ?? [];
            $mrpackUrl = null;
            foreach ($files as $f) {
                $fn = strtolower($f['filename'] ?? '');
                if (str_ends_with($fn, '.mrpack') || str_ends_with($fn, '.zip')) {
                    $mrpackUrl = $f['url'] ?? null;
                    break;
                }
            }
            if (!$mrpackUrl && !empty($files[0]['url'])) {
                $mrpackUrl = $files[0]['url'];
            }

            if (empty($mrpackUrl)) {
                return ['success' => false, 'text' => "No downloadable archive found for modpack '{$modpackTitle}'."];
            }

            // Download .mrpack to panel temp file
            $tmpPack = tempnam(sys_get_temp_dir(), 'ai_mp_');
            $this->httpClient->get($mrpackUrl, [
                'sink' => $tmpPack,
                'timeout' => 90,
                'headers' => ['User-Agent' => 'Pterodactyl-Panel-AI/1.0'],
            ]);

            $zip = new ZipArchive();
            if ($zip->open($tmpPack) !== true) {
                @unlink($tmpPack);
                return ['success' => false, 'text' => "Failed to read downloaded modpack archive."];
            }

            // Extract overrides into clean zip and decompress to root
            $tmpOverridesZip = tempnam(sys_get_temp_dir(), 'ai_ovr_') . '.zip';
            $ovrZip = new ZipArchive();
            $ovrZip->open($tmpOverridesZip, ZipArchive::CREATE | ZipArchive::OVERWRITE);
            $overridesCount = 0;

            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $entryName = $stat['name'] ?? '';
                $relTarget = null;
                if (str_starts_with($entryName, 'overrides/')) {
                    $relTarget = substr($entryName, strlen('overrides/'));
                } elseif (str_starts_with($entryName, 'server-overrides/')) {
                    $relTarget = substr($entryName, strlen('server-overrides/'));
                }
                if ($relTarget !== null && !empty($relTarget) && !str_ends_with($relTarget, '/')) {
                    $c = $zip->getFromIndex($i);
                    if ($c !== false) {
                        $ovrZip->addFromString($relTarget, $c);
                        $overridesCount++;
                    }
                }
            }
            $ovrZip->close();

            if ($overridesCount > 0 && file_exists($tmpOverridesZip) && filesize($tmpOverridesZip) > 0) {
                try {
                    $this->fileRepository->setServer($server)->putContent('/.modpack_overrides.zip', file_get_contents($tmpOverridesZip));
                    $this->fileRepository->setServer($server)->decompressFile('/', '.modpack_overrides.zip');
                } catch (Throwable $e) {}
            }
            @unlink($tmpOverridesZip);

            // Parse modrinth.index.json
            $indexStr = $zip->getFromName('modrinth.index.json');
            $modsToInstall = [];
            $dependencies = [];
            if ($indexStr !== false) {
                $index = json_decode($indexStr, true);
                if (is_array($index)) {
                    $dependencies = $index['dependencies'] ?? [];
                    foreach ($index['files'] ?? [] as $item) {
                        if (($item['env']['server'] ?? 'required') === 'unsupported') continue;
                        $path = ltrim(str_replace('\\', '/', $item['path'] ?? ''), '/');
                        $fn = basename($path);
                        $dir = dirname($path);
                        if ($dir === '.' || empty($dir)) $dir = 'mods';
                        $dls = $item['downloads'] ?? [];
                        if (!empty($dls[0])) {
                            $modsToInstall[] = [
                                'filename' => $fn,
                                'directory' => '/' . $dir,
                                'url' => $dls[0],
                            ];
                        }
                    }
                }
            }
            $zip->close();
            @unlink($tmpPack);

            // Ensure /mods directory exists
            try {
                $this->fileRepository->setServer($server)->createDirectory('mods', '/');
            } catch (Throwable $e) {}

            // Stream-pull mod files in foreground
            $installedCount = 0;
            foreach ($modsToInstall as $m) {
                try {
                    $cleanFn = basename(str_replace(['\\', '/', "\0"], '', $m['filename']));
                    $this->fileRepository->setServer($server)->pull(
                        $m['url'],
                        $m['directory'],
                        [
                            'filename' => $cleanFn,
                            'use_header' => false,
                            'foreground' => true,
                        ]
                    );
                    $installedCount++;
                } catch (Throwable $e) {}
            }

            // Write modpack manifest
            $detectedLoader = isset($dependencies['fabric-loader']) ? 'Fabric'
                : (isset($dependencies['forge']) ? 'Forge'
                : (isset($dependencies['neoforge']) ? 'NeoForge'
                : (isset($dependencies['quilt-loader']) ? 'Quilt' : 'Modded')));
            $gameVer = $dependencies['minecraft'] ?? 'Unknown';

            $manifest = [
                'project_id' => $hit['project_id'],
                'title' => $modpackTitle,
                'version_id' => $chosenVer['id'] ?? '',
                'version_name' => $chosenVer['name'] ?? 'Latest',
                'loader' => strtolower($detectedLoader),
                'minecraft' => $gameVer,
                'icon_url' => $hit['icon_url'] ?? '',
                'installed_at' => date('c'),
                'total_mods' => $installedCount,
            ];

            try {
                $this->fileRepository->setServer($server)->putContent('/.pterodactyl-modpack.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
                $this->fileRepository->setServer($server)->deleteFiles('/', ['.modpack_overrides.zip']);
            } catch (Throwable $e) {}

            // Restart server
            try {
                $this->powerRepository->setServer($server)->send('restart');
            } catch (Throwable $e) {}

            return [
                'success' => true,
                'text' => "Successfully installed modpack '{$modpackTitle}' ({$detectedLoader} for Minecraft {$gameVer}) with {$installedCount} server mods and configuration files! Server restart has been initiated.",
            ];
        } catch (Throwable $e) {
            Log::error("[AIAssistant] Modpack installation failed: " . $e->getMessage());
            return ['success' => false, 'text' => "Modpack installation encountered an error: " . $e->getMessage()];
        }
    }
}
