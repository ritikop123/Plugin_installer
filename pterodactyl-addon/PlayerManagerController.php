<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Repositories\Wings\DaemonCommandRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class PlayerManagerController extends ClientApiController
{
    public const MANIFEST_FILE = '/.pterodactyl-software.json';
    public const STEVE_SKIN_URL = 'https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/entity/player/wide/steve.png';
    public const STEVE_AVATAR_URL = 'https://mc-heads.net/avatar/MHF_Steve/64';

    protected DaemonFileRepository $fileRepository;
    protected DaemonCommandRepository $commandRepository;

    public function __construct(
        DaemonFileRepository $fileRepository,
        DaemonCommandRepository $commandRepository
    ) {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->commandRepository = $commandRepository;
    }

    /**
     * Get server player statistics, online players, all recorded players, and banned players.
     * GET /api/client/servers/{server}/players
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        // 1. Fetch server metadata (cached for 4 seconds for fresh 5s auto-polling)
        $metaKey = "ptero:pm:{$server->id}:meta";
        $meta = Cache::remember($metaKey, 4, function () use ($server) {
            $software = $this->detectServerSoftware($server);
            $category = $software['category'] ?? 'java';
            $properties = $this->readServerProperties($server, $category);
            return [
                'software' => $software,
                'category' => $category,
                'properties' => $properties,
                'user_cache' => $this->readUserCache($server),
                'ops_list' => $this->readOpsList($server, $category),
                'banned_players' => $this->readBannedPlayers($server),
                'banned_ips' => $this->readBannedIps($server),
            ];
        });

        $software = $meta['software'];
        $category = $meta['category'];
        $properties = $meta['properties'];
        $maxPlayers = isset($properties['max-players']) ? (int) $properties['max-players'] : 20;
        $onlineMode = isset($properties['online-mode']) ? strtolower($properties['online-mode']) === 'true' : true;

        $userCache = $meta['user_cache'];
        $opsList = $meta['ops_list'];
        $bannedPlayersRaw = $meta['banned_players'];
        $bannedIps = $meta['banned_ips'];

        // 2. Resolve Port
        $port = ($category === 'bedrock') ? 19132 : 25565;
        $allocation = $server->allocation;
        if ($allocation) {
            $port = (int) $allocation->port;
        }

        // 3. Fast Query server status & online count (UDP RakNet for Bedrock, TCP SLP for Java/Proxy)
        $pingResult = $this->queryServerStatus($server, $port, $category);
        $serverOnline = ($pingResult !== null);
        $onlineCount = 0;
        $slpOnlinePlayers = [];

        if ($pingResult) {
            $onlineCount = (int) ($pingResult['players']['online'] ?? 0);
            if (isset($pingResult['players']['max'])) {
                $maxPlayers = (int) $pingResult['players']['max'];
            }
            if (!empty($pingResult['players']['sample']) && is_array($pingResult['players']['sample'])) {
                foreach ($pingResult['players']['sample'] as $s) {
                    if (!empty($s['name']) && $s['name'] !== 'Anonymous Player') {
                        $slpOnlinePlayers[] = [
                            'name' => $s['name'],
                            'id' => $s['id'] ?? null,
                        ];
                    }
                }
            }
        }

        // 4. Online players mapping (only scan tail of latest.log if SLP didn't return names)
        $mergedOnlineNames = [];
        foreach ($slpOnlinePlayers as $sp) {
            $mergedOnlineNames[strtolower($sp['name'])] = $sp['name'];
        }

        if (empty($mergedOnlineNames) || $onlineCount > count($mergedOnlineNames)) {
            $logOnlinePlayers = $this->getOnlinePlayersFromLog($server);
            foreach ($logOnlinePlayers as $lp) {
                $mergedOnlineNames[strtolower($lp)] = $lp;
            }
        }

        if (!empty($mergedOnlineNames)) {
            $serverOnline = true;
            if ($onlineCount < count($mergedOnlineNames)) {
                $onlineCount = count($mergedOnlineNames);
            }
        } elseif (!$serverOnline && empty($mergedOnlineNames)) {
            $onlineCount = 0;
        }

        // 7. Map online players
        $onlinePlayers = [];
        foreach ($mergedOnlineNames as $pName) {
            $uuid = $this->resolvePlayerUuid($pName, $userCache, $slpOnlinePlayers);
            $skinInfo = $this->resolvePlayerSkin($pName, $uuid, $onlineMode);
            $isOp = $this->isPlayerOp($pName, $uuid, $opsList);

            $onlinePlayers[] = [
                'name' => $pName,
                'uuid' => $uuid,
                'is_op' => $isOp,
                'is_banned' => false,
                'is_online' => true,
                'skin_url' => $skinInfo['skin_url'],
                'avatar_url' => $skinInfo['avatar_url'],
                'render_3d_url' => $skinInfo['render_3d_url'],
                'skin_type' => $skinInfo['skin_type'],
                'skin_name' => $skinInfo['skin_name'],
                'is_cracked' => $skinInfo['is_cracked'],
            ];
        }

        // 8. Map banned players
        $bannedPlayers = [];
        $bannedNameMap = [];
        foreach ($bannedPlayersRaw as $bp) {
            $bpName = $bp['name'] ?? 'Unknown';
            $bpUuid = $bp['uuid'] ?? '';
            if (!empty($bpName)) {
                $bannedNameMap[strtolower($bpName)] = true;
            }
            $skinInfo = $this->resolvePlayerSkin($bpName, $bpUuid, $onlineMode);
            $isOp = $this->isPlayerOp($bpName, $bpUuid, $opsList);

            $bannedPlayers[] = [
                'name' => $bpName,
                'uuid' => $bpUuid,
                'created' => $bp['created'] ?? '',
                'source' => $bp['source'] ?? 'Server',
                'expires' => $bp['expires'] ?? 'forever',
                'reason' => !empty($bp['reason']) ? $bp['reason'] : 'Banned by an operator.',
                'is_op' => $isOp,
                'is_banned' => true,
                'is_online' => false,
                'skin_url' => $skinInfo['skin_url'],
                'avatar_url' => $skinInfo['avatar_url'],
                'render_3d_url' => $skinInfo['render_3d_url'],
                'skin_type' => $skinInfo['skin_type'],
                'skin_name' => $skinInfo['skin_name'],
                'is_cracked' => $skinInfo['is_cracked'],
            ];
        }

        // 9. Map all recorded players from usercache + ops + whitelist/allowlist + online
        $rawAll = $this->getAllKnownPlayers($server, $userCache, $opsList, $bannedPlayersRaw, $mergedOnlineNames);
        $allPlayers = [];

        foreach ($rawAll as $uc) {
            $uName = $uc['name'] ?? '';
            if (empty($uName)) continue;
            $uUuid = !empty($uc['uuid']) ? $uc['uuid'] : $this->resolvePlayerUuid($uName, $userCache, $slpOnlinePlayers);
            $isOnline = isset($mergedOnlineNames[strtolower($uName)]);
            $isBanned = isset($bannedNameMap[strtolower($uName)]);
            $isOp = $this->isPlayerOp($uName, $uUuid, $opsList);
            $skinInfo = $this->resolvePlayerSkin($uName, $uUuid, $onlineMode);

            $allPlayers[] = [
                'name' => $uName,
                'uuid' => $uUuid,
                'expires_on' => $uc['expiresOn'] ?? '',
                'is_op' => $isOp,
                'is_banned' => $isBanned,
                'is_online' => $isOnline,
                'skin_url' => $skinInfo['skin_url'],
                'avatar_url' => $skinInfo['avatar_url'],
                'render_3d_url' => $skinInfo['render_3d_url'],
                'skin_type' => $skinInfo['skin_type'],
                'skin_name' => $skinInfo['skin_name'],
                'is_cracked' => $skinInfo['is_cracked'],
            ];
        }

        // Sort all players: Online players first, then alphabetically
        usort($allPlayers, function ($a, $b) {
            if ($a['is_online'] !== $b['is_online']) {
                return $a['is_online'] ? -1 : 1;
            }
            return strcasecmp($a['name'], $b['name']);
        });

        return response()->json([
            'success' => true,
            'software' => $software,
            'server_online' => $serverOnline,
            'online_count' => $onlineCount,
            'max_players' => $maxPlayers,
            'online_mode' => $onlineMode,
            'online_players' => $onlinePlayers,
            'banned_players' => $bannedPlayers,
            'banned_ips' => $bannedIps,
            'all_players' => $allPlayers,
        ]);
    }

    /**
     * Get single player full details, parsed inventory, ender chest, and attributes.
     * GET /api/client/servers/{server}/players/detail?player=<name>&uuid=<uuid>
     */
    public function detail(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $software = $this->detectServerSoftware($server);
        $category = $software['category'] ?? 'java';

        $playerName = trim((string) $request->query('player', ''));
        $playerUuid = trim((string) $request->query('uuid', ''));

        $properties = $this->readServerProperties($server, $category);
        $onlineMode = isset($properties['online-mode']) ? strtolower($properties['online-mode']) === 'true' : true;
        $levelName = $properties['level-name'] ?? 'world';

        $userCache = $this->readUserCache($server);
        if (empty($playerUuid) && !empty($playerName)) {
            $playerUuid = $this->resolvePlayerUuid($playerName, $userCache);
        }
        if (empty($playerName) && !empty($playerUuid)) {
            foreach ($userCache as $u) {
                if (($u['uuid'] ?? '') === $playerUuid) {
                    $playerName = $u['name'] ?? '';
                    break;
                }
            }
        }

        $opsList = $this->readOpsList($server, $category);
        $isOp = $this->isPlayerOp($playerName, $playerUuid, $opsList);

        $bannedPlayersRaw = $this->readBannedPlayers($server);
        $isBanned = false;
        $banInfo = null;
        foreach ($bannedPlayersRaw as $bp) {
            if (
                (!empty($playerName) && strcasecmp($bp['name'] ?? '', $playerName) === 0) ||
                (!empty($playerUuid) && strcasecmp($bp['uuid'] ?? '', $playerUuid) === 0)
            ) {
                $isBanned = true;
                $banInfo = [
                    'created' => $bp['created'] ?? '',
                    'source' => $bp['source'] ?? 'Server',
                    'expires' => $bp['expires'] ?? 'forever',
                    'reason' => !empty($bp['reason']) ? $bp['reason'] : 'Banned by an operator.',
                ];
                break;
            }
        }

        $skinInfo = $this->resolvePlayerSkin($playerName, $playerUuid, $onlineMode);

        // Read single playerdata NBT file (if Java)
        $nbtData = ($category === 'java') ? $this->readPlayerNbtData($server, $playerName, $playerUuid, $levelName) : [
            'inventory' => [],
            'ender_chest' => [],
            'health' => 20.0,
            'food_level' => 20,
            'level' => 0,
            'exp' => 0.0,
            'game_mode' => 0,
            'dimension' => 'minecraft:overworld',
            'pos' => [0, 64, 0],
            'last_modified' => null,
        ];

        return response()->json([
            'success' => true,
            'software' => $software,
            'name' => $playerName,
            'uuid' => $playerUuid,
            'is_op' => $isOp,
            'is_banned' => $isBanned,
            'ban_info' => $banInfo,
            'skin_url' => $skinInfo['skin_url'],
            'avatar_url' => $skinInfo['avatar_url'],
            'render_3d_url' => $skinInfo['render_3d_url'],
            'skin_type' => $skinInfo['skin_type'],
            'skin_name' => $skinInfo['skin_name'],
            'is_cracked' => $skinInfo['is_cracked'],
            'inventory' => $nbtData['inventory'] ?? [],
            'ender_chest' => $nbtData['ender_chest'] ?? [],
            'stats' => [
                'health' => $nbtData['health'] ?? 20.0,
                'food_level' => $nbtData['food_level'] ?? 20,
                'level' => $nbtData['level'] ?? 0,
                'exp' => $nbtData['exp'] ?? 0.0,
                'game_mode' => $nbtData['game_mode'] ?? 0,
                'dimension' => $nbtData['dimension'] ?? 'minecraft:overworld',
                'pos' => $nbtData['pos'] ?? [0, 64, 0],
                'last_modified' => $nbtData['last_modified'] ?? null,
            ],
        ]);
    }

    /**
     * Execute a player management action (OP, deop, kick, ban, unban, heal, feed, clear, gamemode, etc.).
     * POST /api/client/servers/{server}/players/action
     */
    public function action(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_CONTROL_CONSOLE, $server)) {
            throw new AuthorizationException();
        }

        $software = $this->detectServerSoftware($server);
        $category = $software['category'] ?? 'java';

        $action = strtolower(trim((string) $request->input('action', '')));
        $player = trim((string) $request->input('player', ''));
        $uuid = trim((string) $request->input('uuid', ''));
        $reason = trim((string) $request->input('reason', ''));
        $gamemode = strtolower(trim((string) $request->input('gamemode', 'survival')));
        $message = trim((string) $request->input('message', ''));
        $banIp = (bool) $request->input('ban_ip', false);

        // Instant real-time player synchronization via console /list or /glist
        if ($action === 'sync' || $action === 'refresh') {
            Cache::forget("ptero:pm:{$server->id}:meta");
            Cache::forget("ptero:pm:{$server->id}:log_online");
            try {
                $syncCmd = ($category === 'proxy') ? 'glist' : 'list';
                $this->sendCommand($server, $syncCmd);
                usleep(350000); // 350ms
            } catch (Exception $e) {}
            return $this->index($request, $server);
        }

        if (empty($player) && empty($uuid)) {
            return response()->json(['error' => 'Player username or UUID is required.'], 400);
        }

        // Clean player name to prevent command injection, preserving valid characters for Bedrock / Geyser
        $cleanPlayer = trim(preg_replace('/[^a-zA-Z0-9_.* -]/', '', $player));
        if (empty($cleanPlayer)) {
            $cleanPlayer = $player;
        }

        // Quote player name if it contains spaces (Bedrock Gamertag or Floodgate)
        $cmdTarget = str_contains($cleanPlayer, ' ') ? "\"{$cleanPlayer}\"" : $cleanPlayer;
        $cleanReason = preg_replace('/[\r\n"]/', ' ', $reason);
        $executedCommands = [];

        try {
            switch ($action) {
                case 'op':
                    if ($category === 'bedrock') {
                        try {
                            $this->sendCommand($server, "permission set {$cmdTarget} operator");
                        } catch (Exception $ex) {}
                        $cmd = "op {$cmdTarget}";
                        $this->sendCommand($server, $cmd);
                    } else {
                        $cmd = "op {$cmdTarget}";
                        $this->sendCommand($server, $cmd);
                    }
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer} has been granted Operator status.";
                    break;

                case 'deop':
                    if ($category === 'bedrock') {
                        try {
                            $this->sendCommand($server, "permission set {$cmdTarget} member");
                        } catch (Exception $ex) {}
                        $cmd = "deop {$cmdTarget}";
                        $this->sendCommand($server, $cmd);
                    } else {
                        $cmd = "deop {$cmdTarget}";
                        $this->sendCommand($server, $cmd);
                    }
                    $executedCommands[] = $cmd;
                    $msg = "Operator status revoked for {$cleanPlayer}.";
                    break;

                case 'kick':
                    $kickReason = !empty($cleanReason) ? $cleanReason : 'Kicked by server administrator.';
                    $cmd = "kick {$cmdTarget} {$kickReason}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer} was kicked from the server.";
                    break;

                case 'ban':
                    $banReason = !empty($cleanReason) ? $cleanReason : 'Banned by server administrator.';
                    $cmd = "ban {$cmdTarget} {$banReason}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;

                    if ($banIp) {
                        $cmdIp = "ban-ip {$cmdTarget} {$banReason}";
                        try {
                            $this->sendCommand($server, $cmdIp);
                            $executedCommands[] = $cmdIp;
                        } catch (Exception $ex) {}
                    }
                    $msg = "Player {$cleanPlayer} has been banned.";
                    break;

                case 'unban':
                case 'pardon':
                    $cmd = "pardon {$cmdTarget}";
                    try {
                        $this->sendCommand($server, $cmd);
                        $executedCommands[] = $cmd;
                    } catch (Exception $e) {}

                    // Also remove directly from banned-players.json / banned-players.txt to guarantee unban even if server is offline
                    $this->removeBannedPlayerRecord($server, $cleanPlayer, $uuid);

                    if ($banIp) {
                        try {
                            $cmdIp = "pardon-ip {$cmdTarget}";
                            $this->sendCommand($server, $cmdIp);
                            $executedCommands[] = $cmdIp;
                        } catch (Exception $ex) {}
                    }
                    $msg = "Player {$cleanPlayer} has been unbanned.";
                    break;

                case 'heal':
                    if ($category === 'bedrock') {
                        $cmdHealth = "effect {$cmdTarget} instant_health 1 255";
                        $cmdSat = "effect {$cmdTarget} saturation 1 255";
                        try { $this->sendCommand($server, $cmdHealth); } catch (Exception $e) {}
                        try { $this->sendCommand($server, $cmdSat); } catch (Exception $e) {}
                        try { $this->sendCommand($server, "effect give {$cmdTarget} instant_health 1 255"); } catch (Exception $e) {}
                        $executedCommands[] = $cmdHealth;
                    } else {
                        $cmdHealth = "effect give {$cmdTarget} minecraft:instant_health 1 255";
                        $cmdSat = "effect give {$cmdTarget} minecraft:saturation 1 255";
                        $this->sendCommand($server, $cmdHealth);
                        $this->sendCommand($server, $cmdSat);
                        $executedCommands[] = $cmdHealth;
                        $executedCommands[] = $cmdSat;
                        try {
                            $this->sendCommand($server, "heal {$cmdTarget}");
                        } catch (Exception $ex) {}
                    }
                    $msg = "Player {$cleanPlayer} has been fully healed and fed.";
                    break;

                case 'feed':
                    if ($category === 'bedrock') {
                        $cmdSat = "effect {$cmdTarget} saturation 1 255";
                        try { $this->sendCommand($server, $cmdSat); } catch (Exception $e) {}
                        try { $this->sendCommand($server, "effect give {$cmdTarget} saturation 1 255"); } catch (Exception $e) {}
                        $executedCommands[] = $cmdSat;
                    } else {
                        $cmdSat = "effect give {$cmdTarget} minecraft:saturation 1 255";
                        $this->sendCommand($server, $cmdSat);
                        $executedCommands[] = $cmdSat;
                        try {
                            $this->sendCommand($server, "feed {$cmdTarget}");
                        } catch (Exception $ex) {}
                    }
                    $msg = "Player {$cleanPlayer} has been fully fed.";
                    break;

                case 'clear':
                    $cmd = "clear {$cmdTarget}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer}'s inventory was cleared.";
                    break;

                case 'kill':
                    $cmd = "kill {$cmdTarget}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer} was killed.";
                    break;

                case 'gamemode':
                    $allowedModes = ['survival', 'creative', 'adventure', 'spectator'];
                    if (!in_array($gamemode, $allowedModes)) {
                        $gamemode = 'survival';
                    }
                    $cmd = "gamemode {$gamemode} {$cmdTarget}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Gamemode for {$cleanPlayer} changed to " . ucfirst($gamemode) . ".";
                    break;

                case 'message':
                case 'whisper':
                case 'tell':
                    $cleanMsg = preg_replace('/[\r\n"]/', ' ', $message);
                    $cmd = "tell {$cmdTarget} {$cleanMsg}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Message sent to {$cleanPlayer}.";
                    break;

                default:
                    return response()->json(['error' => "Unsupported action '{$action}'."], 400);
            }

            // Purge caches so the next player index fetch is immediately updated with new state
            Cache::forget("ptero:pm:{$server->id}:meta");
            Cache::forget("ptero:pm:{$server->id}:log_online");

            return response()->json([
                'success' => true,
                'action' => $action,
                'player' => $cleanPlayer,
                'message' => $msg,
                'commands' => $executedCommands,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => "Failed to execute '{$action}': " . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Dispatch command to server console.
     */
    private function sendCommand(Server $server, string $command): void
    {
        $this->commandRepository->setServer($server)->send($command);
    }

    /**
     * Helper to read server.properties or proxy config.
     */
    private function readServerProperties(Server $server, string $category = 'java'): array
    {
        $properties = [];
        $filesToTry = ['/server.properties'];
        if ($category === 'bedrock') {
            $filesToTry = ['/server.properties', '/pocketmine.yml'];
        } elseif ($category === 'proxy') {
            $filesToTry = ['/config.yml', '/velocity.toml', '/server.properties'];
        }

        foreach ($filesToTry as $file) {
            try {
                $raw = $this->fileRepository->setServer($server)->getContent($file);
                if (empty($raw)) continue;

                $lines = explode("\n", str_replace("\r\n", "\n", $raw));
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (empty($trimmed) || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '!')) {
                        continue;
                    }
                    if (str_contains($line, '=')) {
                        $parts = explode('=', $line, 2);
                        $properties[trim($parts[0])] = trim($parts[1]);
                    } elseif (str_contains($line, ':')) {
                        $parts = explode(':', $line, 2);
                        $properties[trim($parts[0])] = trim(trim($parts[1]), '"\'');
                    }
                }
                if (!empty($properties)) {
                    break;
                }
            } catch (Exception $e) {}
        }

        // Bedrock BDS mapping
        if ($category === 'bedrock') {
            if (!empty($properties['server-name']) && empty($properties['motd'])) {
                $properties['motd'] = $properties['server-name'];
            }
        }

        return $properties;
    }

    /**
     * Read usercache.json
     */
    private function readUserCache(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/usercache.json');
            $decoded = json_decode($content, true);
            return is_array($decoded) ? $decoded : [];
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * Read ops.json / permissions.json (Bedrock) / ops.txt
     */
    private function readOpsList(Server $server, string $category = 'java'): array
    {
        $ops = [];

        // 1. Standard Java ops.json
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/ops.json');
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        } catch (Exception $e) {}

        // 2. Bedrock BDS permissions.json
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/permissions.json');
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                foreach ($decoded as $p) {
                    if (is_array($p) && strtolower($p['permission'] ?? '') === 'operator') {
                        $ops[] = [
                            'name' => $p['name'] ?? '',
                            'uuid' => $p['xuid'] ?? ($p['uuid'] ?? ''),
                            'level' => 4,
                        ];
                    }
                }
                if (!empty($ops)) return $ops;
            }
        } catch (Exception $e) {}

        // 3. PocketMine / Nukkit / Older Forge ops.txt
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/ops.txt');
            if (!empty($content)) {
                $lines = explode("\n", str_replace("\r\n", "\n", $content));
                foreach ($lines as $line) {
                    $name = trim($line);
                    if (!empty($name) && !str_starts_with($name, '#')) {
                        $ops[] = [
                            'name' => $name,
                            'uuid' => '',
                            'level' => 4,
                        ];
                    }
                }
            }
        } catch (Exception $e) {}

        return $ops;
    }

    /**
     * Read banned-players.json / banned-players.txt
     */
    private function readBannedPlayers(Server $server): array
    {
        // 1. banned-players.json
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/banned-players.json');
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        } catch (Exception $e) {}

        // 2. banned-players.txt (PocketMine / Older servers)
        $banned = [];
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/banned-players.txt');
            if (!empty($content)) {
                $lines = explode("\n", str_replace("\r\n", "\n", $content));
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (empty($trimmed) || str_starts_with($trimmed, '#')) continue;
                    $parts = explode('|', $trimmed);
                    $banned[] = [
                        'name' => trim($parts[0] ?? $trimmed),
                        'uuid' => '',
                        'created' => $parts[1] ?? '',
                        'source' => $parts[2] ?? 'Server',
                        'expires' => $parts[3] ?? 'forever',
                        'reason' => $parts[4] ?? 'Banned by an operator.',
                    ];
                }
            }
        } catch (Exception $e) {}

        return $banned;
    }

    /**
     * Read banned-ips.json / banned-ips.txt
     */
    private function readBannedIps(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/banned-ips.json');
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        } catch (Exception $e) {}

        $bannedIps = [];
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/banned-ips.txt');
            if (!empty($content)) {
                $lines = explode("\n", str_replace("\r\n", "\n", $content));
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (!empty($trimmed) && !str_starts_with($trimmed, '#')) {
                        $parts = explode('|', $trimmed);
                        $bannedIps[] = [
                            'ip' => trim($parts[0] ?? $trimmed),
                            'created' => $parts[1] ?? '',
                            'source' => $parts[2] ?? 'Server',
                            'expires' => $parts[3] ?? 'forever',
                            'reason' => $parts[4] ?? 'Banned by an operator.',
                        ];
                    }
                }
            }
        } catch (Exception $e) {}

        return $bannedIps;
    }

    /**
     * Check if a player is in ops list
     */
    private function isPlayerOp(string $name, ?string $uuid, array $opsList): bool
    {
        foreach ($opsList as $op) {
            if (!empty($name) && strcasecmp($op['name'] ?? '', $name) === 0) {
                return true;
            }
            if (!empty($uuid) && !empty($op['uuid']) && strcasecmp($op['uuid'], $uuid) === 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * Resolve player UUID from usercache or online samples.
     */
    private function resolvePlayerUuid(string $playerName, array $userCache, array $samples = []): string
    {
        foreach ($samples as $s) {
            if (strcasecmp($s['name'] ?? '', $playerName) === 0 && !empty($s['id'])) {
                return (string) $s['id'];
            }
        }
        foreach ($userCache as $uc) {
            if (strcasecmp($uc['name'] ?? '', $playerName) === 0 && !empty($uc['uuid'])) {
                return (string) $uc['uuid'];
            }
        }
        return $this->generateOfflineUuid($playerName);
    }

    /**
     * Generate standard Minecraft offline UUID for cracked players.
     */
    private function generateOfflineUuid(string $playerName): string
    {
        $hash = md5("OfflinePlayer:" . $playerName);
        return sprintf(
            '%08s-%04s-%04s-%04s-%12s',
            substr($hash, 0, 8),
            substr($hash, 8, 4),
            dechex(hexdec(substr($hash, 12, 4)) & 0x0fff | 0x3000),
            dechex(hexdec(substr($hash, 16, 4)) & 0x3fff | 0x8000),
            substr($hash, 20, 12)
        );
    }

    /**
     * Resolve skin, avatar, and 3D render preview based on player name.
     */
    private function resolvePlayerSkin(string $playerName, string $playerUuid, bool $onlineMode): array
    {
        $cleanName = trim($playerName);
        if (empty($cleanName)) {
            return [
                'skin_type' => 'steve',
                'skin_name' => 'Steve',
                'is_cracked' => !$onlineMode,
                'skin_url' => self::STEVE_SKIN_URL,
                'avatar_url' => self::STEVE_AVATAR_URL,
                'render_3d_url' => "https://visage.surgeplay.com/full/512/MHF_Steve",
            ];
        }

        // Check if Bedrock or Floodgate player (starts with . or * or contains spaces)
        $isBedrock = str_starts_with($cleanName, '.') || str_starts_with($cleanName, '*') || str_contains($cleanName, ' ');
        if ($isBedrock) {
            $skinName = ltrim($cleanName, '.*');
            $encodedName = urlencode($skinName);
            return [
                'skin_type' => 'standard',
                'skin_name' => $cleanName,
                'is_cracked' => true,
                'skin_url' => "https://mc-heads.net/skin/{$encodedName}",
                'avatar_url' => "https://mc-heads.net/avatar/{$encodedName}/64",
                'render_3d_url' => "https://visage.surgeplay.com/full/512/MHF_Steve",
            ];
        }

        $encodedName = urlencode($cleanName);
        return [
            'skin_type' => $onlineMode ? 'premium' : 'standard',
            'skin_name' => $cleanName,
            'is_cracked' => !$onlineMode,
            'skin_url' => "https://mc-heads.net/skin/{$encodedName}",
            'avatar_url' => "https://mc-heads.net/avatar/{$encodedName}/64",
            'render_3d_url' => "https://visage.surgeplay.com/full/512/{$encodedName}",
        ];
    }

    /**
     * Remove player from banned-players.json / banned-players.txt directly.
     */
    private function removeBannedPlayerRecord(Server $server, string $name, string $uuid): void
    {
        // 1. Clean banned-players.json
        try {
            $raw = $this->fileRepository->setServer($server)->getContent('/banned-players.json');
            $banned = json_decode($raw, true);
            if (is_array($banned)) {
                $updated = [];
                foreach ($banned as $b) {
                    $matchName = !empty($name) && strcasecmp($b['name'] ?? '', $name) === 0;
                    $matchUuid = !empty($uuid) && !empty($b['uuid']) && strcasecmp($b['uuid'], $uuid) === 0;
                    if (!$matchName && !$matchUuid) {
                        $updated[] = $b;
                    }
                }
                $this->fileRepository->setServer($server)->putContent(
                    '/banned-players.json',
                    json_encode($updated, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
                );
            }
        } catch (Exception $e) {}

        // 2. Clean banned-players.txt
        try {
            $rawTxt = $this->fileRepository->setServer($server)->getContent('/banned-players.txt');
            if (!empty($rawTxt)) {
                $lines = explode("\n", str_replace("\r\n", "\n", $rawTxt));
                $newLines = [];
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (empty($trimmed)) continue;
                    $parts = explode('|', $trimmed);
                    if (strcasecmp(trim($parts[0] ?? ''), $name) !== 0) {
                        $newLines[] = $line;
                    }
                }
                $this->fileRepository->setServer($server)->putContent('/banned-players.txt', implode("\n", $newLines));
            }
        } catch (Exception $e) {}
    }

    /**
     * Inspect latest.log to track currently joined players across Java, Bedrock BDS, Proxies, and Modded.
     */
    private function getOnlinePlayersFromLog(Server $server): array
    {
        $cacheKey = "ptero:pm:{$server->id}:log_online";
        return Cache::remember($cacheKey, 4, function () use ($server) {
            $online = [];
            try {
                $raw = '';
                try {
                    $raw = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
                } catch (Exception $e) {}

                if (empty($raw)) {
                    try {
                        $raw = $this->fileRepository->setServer($server)->getContent('/proxy.log.0');
                    } catch (Exception $e) {}
                }
                if (empty($raw)) return [];

                // Slice to tail 48KB to prevent CPU lag on huge log files
                if (strlen($raw) > 49152) {
                    $raw = substr($raw, -49152);
                }

                // Strip ANSI escape codes and Minecraft section symbol formatting (§x)
                $cleanLog = preg_replace('/\x1b\[[0-9;]*[a-zA-Z]|\x1b\([a-zA-Z]|§[0-9a-fk-or]/i', '', $raw);
                $lines = explode("\n", str_replace("\r\n", "\n", $cleanLog));
                $tail = count($lines) > 400 ? array_slice($lines, -400) : $lines;

                foreach ($tail as $line) {
                    $line = trim($line);
                    if (empty($line)) continue;

                    // 1. /list or connected players output
                    if (
                        preg_match('/(?:There are \d+(?:\/\d+| of a max of \d+) players online:|Connected players:)\s*(.*)/i', $line, $listMatch) ||
                        preg_match('/\[.*?\]\s*\(\d+\):\s*(.*)/i', $line, $listMatch)
                    ) {
                        $playerListStr = trim($listMatch[1]);
                        if (!empty($playerListStr)) {
                            $names = explode(',', $playerListStr);
                            foreach ($names as $n) {
                                $cleanName = trim($n);
                                if (preg_match('/^[a-zA-Z0-9_.* -]{2,32}$/', $cleanName) && !in_array(strtolower($cleanName), ['server', 'console', 'anonymous'])) {
                                    $online[strtolower($cleanName)] = $cleanName;
                                }
                            }
                        }
                        continue;
                    }

                    // 2. Bedrock BDS Join: "Player connected: Cool Gamer, xuid: ..."
                    if (preg_match('/Player connected:\s*([^,\n\r]+),\s*xuid:/i', $line, $m) || preg_match('/Player Spawned:\s*([^,\n\r]+)\s*xuid:/i', $line, $m)) {
                        $p = trim($m[1]);
                        if (!empty($p) && !in_array(strtolower($p), ['server', 'console', 'anonymous'])) {
                            $online[strtolower($p)] = $p;
                        }
                        continue;
                    }

                    // 3. Bedrock BDS Leave: "Player disconnected: Cool Gamer, xuid: ..."
                    if (preg_match('/Player disconnected:\s*([^,\n\r]+),\s*xuid:/i', $line, $m)) {
                        $p = trim($m[1]);
                        unset($online[strtolower($p)]);
                        continue;
                    }

                    // 4. BungeeCord / Waterfall Join: "[PlayerName] <-> InitialHandler has connected"
                    if (preg_match('/\[([a-zA-Z0-9_.* -]{2,32})\]\s+<->\s+InitialHandler has connected/i', $line, $m) || preg_match('/\[([a-zA-Z0-9_.* -]{2,32})\]\s+has connected to/i', $line, $m)) {
                        $p = trim($m[1]);
                        if (!in_array(strtolower($p), ['server', 'console', 'anonymous'])) {
                            $online[strtolower($p)] = $p;
                        }
                        continue;
                    }

                    // 5. BungeeCord Leave: "[PlayerName] has disconnected"
                    if (preg_match('/\[([a-zA-Z0-9_.* -]{2,32})\]\s+(?:<->\s+InitialHandler has disconnected|has disconnected)/i', $line, $m)) {
                        $p = trim($m[1]);
                        unset($online[strtolower($p)]);
                        continue;
                    }

                    // 6. Velocity Join: "[connected player] PlayerName (/ip) has connected to"
                    if (preg_match('/\[connected player\]\s+([a-zA-Z0-9_.* -]{2,32})\s+\(.*?\)\s+has connected to/i', $line, $m)) {
                        $p = trim($m[1]);
                        if (!in_array(strtolower($p), ['server', 'console', 'anonymous'])) {
                            $online[strtolower($p)] = $p;
                        }
                        continue;
                    }

                    // 7. Velocity Leave: "[connected player] PlayerName (/ip) has disconnected"
                    if (preg_match('/\[connected player\]\s+([a-zA-Z0-9_.* -]{2,32})\s+\(.*?\)\s+has disconnected/i', $line, $m)) {
                        $p = trim($m[1]);
                        unset($online[strtolower($p)]);
                        continue;
                    }

                    // 8. Java Standard Join / Login
                    if (
                        preg_match('/:\s+([a-zA-Z0-9_.* -]{2,32})\[.*?\]\s+logged in/i', $line, $m) ||
                        preg_match('/:\s+([a-zA-Z0-9_.* -]{2,32})\s+joined the game/i', $line, $m) ||
                        preg_match('/UUID of player\s+([a-zA-Z0-9_.* -]{2,32})\s+is/i', $line, $m) ||
                        preg_match('/Player\s+([a-zA-Z0-9_.* -]{2,32})\s+connected/i', $line, $m) ||
                        preg_match('/User\s+([a-zA-Z0-9_.* -]{2,32})\s+\(UUID:.*?\)\s+logged in/i', $line, $m)
                    ) {
                        $p = trim($m[1]);
                        if (!in_array(strtolower($p), ['server', 'console', 'anonymous'])) {
                            $online[strtolower($p)] = $p;
                        }
                    }

                    // 9. Java Standard Leave / Disconnect
                    if (
                        preg_match('/:\s+([a-zA-Z0-9_.* -]{2,32})\s+(?:lost connection|left the game)/i', $line, $m) ||
                        preg_match('/Disconnecting\s+([a-zA-Z0-9_.* -]{2,32}):/i', $line, $m) ||
                        preg_match('/Kicking\s+([a-zA-Z0-9_.* -]{2,32})/i', $line, $m) ||
                        preg_match('/Player\s+([a-zA-Z0-9_.* -]{2,32})\s+disconnected/i', $line, $m)
                    ) {
                        $p = trim($m[1]);
                        unset($online[strtolower($p)]);
                    }
                }
            } catch (Exception $e) {}

            return array_values($online);
        });
    }

    /**
     * Merge player records: usercache.json, ops, whitelist/allowlist, banned-players,
     * and currently online players in memory.
     */
    private function getAllKnownPlayers(
        Server $server,
        array $userCache,
        array $opsList,
        array $bannedPlayersRaw,
        array $onlineNames
    ): array {
        $playersMap = [];

        // 1. From usercache.json
        foreach ($userCache as $uc) {
            $name = trim($uc['name'] ?? '');
            if (!empty($name)) {
                $playersMap[strtolower($name)] = [
                    'name' => $name,
                    'uuid' => $uc['uuid'] ?? '',
                    'expiresOn' => $uc['expiresOn'] ?? '',
                ];
            }
        }

        // 2. From opsList (includes BDS permissions.json & ops.txt)
        foreach ($opsList as $op) {
            $name = trim($op['name'] ?? '');
            if (!empty($name) && !isset($playersMap[strtolower($name)])) {
                $playersMap[strtolower($name)] = [
                    'name' => $name,
                    'uuid' => $op['uuid'] ?? '',
                    'expiresOn' => '',
                ];
            }
        }

        // 3. From banned-players
        foreach ($bannedPlayersRaw as $bp) {
            $name = trim($bp['name'] ?? '');
            if (!empty($name) && !isset($playersMap[strtolower($name)])) {
                $playersMap[strtolower($name)] = [
                    'name' => $name,
                    'uuid' => $bp['uuid'] ?? '',
                    'expiresOn' => '',
                ];
            }
        }

        // 4. From whitelist.json / allowlist.json (BDS) / white-list.txt
        foreach (['/whitelist.json', '/allowlist.json', '/white-list.txt', '/whitelist.txt'] as $wFile) {
            try {
                $rawWhitelist = $this->fileRepository->setServer($server)->getContent($wFile);
                if (empty($rawWhitelist)) continue;

                $whitelist = json_decode($rawWhitelist, true);
                if (is_array($whitelist)) {
                    foreach ($whitelist as $wl) {
                        $name = trim($wl['name'] ?? '');
                        if (!empty($name) && !isset($playersMap[strtolower($name)])) {
                            $playersMap[strtolower($name)] = [
                                'name' => $name,
                                'uuid' => $wl['uuid'] ?? ($wl['xuid'] ?? ''),
                                'expiresOn' => '',
                            ];
                        }
                    }
                } else {
                    $lines = explode("\n", str_replace("\r\n", "\n", $rawWhitelist));
                    foreach ($lines as $line) {
                        $name = trim($line);
                        if (!empty($name) && !str_starts_with($name, '#') && !isset($playersMap[strtolower($name)])) {
                            $playersMap[strtolower($name)] = [
                                'name' => $name,
                                'uuid' => '',
                                'expiresOn' => '',
                            ];
                        }
                    }
                }
            } catch (Exception $e) {}
        }

        // 5. From currently online players
        foreach ($onlineNames as $onName) {
            if (!isset($playersMap[strtolower($onName)])) {
                $playersMap[strtolower($onName)] = [
                    'name' => $onName,
                    'uuid' => '',
                    'expiresOn' => '',
                ];
            }
        }

        return array_values($playersMap);
    }

    /**
     * Read playerdata/<uuid>.dat and extract inventory and player stats using pure PHP NBT parser.
     * Supports offline mode (cracked), online mode (premium), and multi-version item components.
     */
    private function readPlayerNbtData(Server $server, string $playerName, string $playerUuid, string $levelName = 'world'): array
    {
        $result = [
            'inventory' => [],
            'ender_chest' => [],
            'health' => 20.0,
            'food_level' => 20,
            'level' => 0,
            'exp' => 0.0,
            'game_mode' => 0,
            'dimension' => 'minecraft:overworld',
            'pos' => [0, 64, 0],
            'last_modified' => null,
            'last_known_name' => null,
            'money' => null,
        ];

        // 1. Gather all candidate UUIDs (online, offline, usercache, clean)
        $candidates = [];
        if (!empty($playerUuid)) {
            $clean = strtolower(trim($playerUuid));
            $candidates[] = $clean;
            $noDashes = str_replace('-', '', $clean);
            if (strlen($noDashes) === 32) {
                $withDashes = sprintf(
                    '%s-%s-%s-%s-%s',
                    substr($noDashes, 0, 8),
                    substr($noDashes, 8, 4),
                    substr($noDashes, 12, 4),
                    substr($noDashes, 16, 4),
                    substr($noDashes, 20)
                );
                $candidates[] = $withDashes;
                $candidates[] = $noDashes;
            }
        }

        if (!empty($playerName)) {
            $offlineUuid = strtolower($this->generateOfflineUuid($playerName));
            $candidates[] = $offlineUuid;
            $candidates[] = str_replace('-', '', $offlineUuid);

            // Also check usercache.json for this player's UUID
            try {
                $uc = $this->readUserCache($server);
                foreach ($uc as $u) {
                    if (strcasecmp($u['name'] ?? '', $playerName) === 0 && !empty($u['uuid'])) {
                        $candidates[] = strtolower($u['uuid']);
                        $candidates[] = str_replace('-', '', strtolower($u['uuid']));
                    }
                }
            } catch (Exception $e) {}
        }

        $candidates = array_values(array_unique(array_filter($candidates)));

        $possibleDirs = [
            "/{$levelName}/playerdata",
            "/world/playerdata",
            "/playerdata",
            "/{$levelName}_nether/playerdata",
            "/{$levelName}_the_end/playerdata",
            "/worlds/{$levelName}/playerdata",
            "/worlds/world/playerdata",
        ];

        $rawBytes = null;
        foreach ($possibleDirs as $dir) {
            foreach ($candidates as $cand) {
                $path = "{$dir}/{$cand}.dat";
                try {
                    $content = $this->fileRepository->setServer($server)->getContent($path);
                    if (!empty($content)) {
                        $rawBytes = $content;
                        break 2;
                    }
                } catch (Exception $e) {}
            }
        }

        if (empty($rawBytes)) {
            // Check Essentials userdata if available
            foreach ($candidates as $cand) {
                try {
                    $essYaml = $this->fileRepository->setServer($server)->getContent("/plugins/Essentials/userdata/{$cand}.yml");
                    if (!empty($essYaml)) {
                        $this->parseEssentialsUserData($essYaml, $result);
                        break;
                    }
                } catch (Exception $e) {}
            }
            return $result;
        }

        // Multi-compression decompression: GZIP -> ZLIB -> DEFLATE -> RAW
        $decompressed = @gzdecode($rawBytes);
        if ($decompressed === false) {
            $decompressed = @gzuncompress($rawBytes);
        }
        if ($decompressed === false) {
            $decompressed = @gzinflate($rawBytes);
        }
        if ($decompressed === false) {
            $decompressed = $rawBytes;
        }

        try {
            $parsedNbt = $this->parseNbt($decompressed);
            if (!empty($parsedNbt['payload']) && is_array($parsedNbt['payload'])) {
                $root = $parsedNbt['payload'];

                if (!empty($root['bukkit']['lastKnownName'])) {
                    $result['last_known_name'] = (string) $root['bukkit']['lastKnownName'];
                }

                if (isset($root['Health'])) {
                    $result['health'] = round((float) $root['Health'], 1);
                }
                if (isset($root['foodLevel'])) {
                    $result['food_level'] = (int) $root['foodLevel'];
                }
                if (isset($root['XpLevel'])) {
                    $result['level'] = (int) $root['XpLevel'];
                }
                if (isset($root['XpP'])) {
                    $result['exp'] = round((float) $root['XpP'], 2);
                }
                if (isset($root['playerGameType'])) {
                    $result['game_mode'] = (int) $root['playerGameType'];
                }
                if (isset($root['Dimension'])) {
                    $result['dimension'] = (string) $root['Dimension'];
                }
                if (!empty($root['Pos']) && is_array($root['Pos'])) {
                    $result['pos'] = array_map(fn($v) => round((float) $v, 1), $root['Pos']);
                }

                if (!empty($root['Inventory']) && is_array($root['Inventory'])) {
                    $result['inventory'] = $this->formatItemList($root['Inventory']);
                }

                if (!empty($root['EnderItems']) && is_array($root['EnderItems'])) {
                    $result['ender_chest'] = $this->formatItemList($root['EnderItems']);
                }
            }
        } catch (Throwable $e) {}

        // Check Essentials for extra stats like money if present
        foreach ($candidates as $cand) {
            try {
                $essYaml = $this->fileRepository->setServer($server)->getContent("/plugins/Essentials/userdata/{$cand}.yml");
                if (!empty($essYaml)) {
                    $this->parseEssentialsUserData($essYaml, $result);
                    break;
                }
            } catch (Exception $e) {}
        }

        return $result;
    }

    /**
     * Parse Essentials YAML userdata file for extra player details.
     */
    private function parseEssentialsUserData(string $yaml, array &$result): void
    {
        if (preg_match('/money:\s*[\'"]?([0-9.]+)[\'"]?/i', $yaml, $m)) {
            $result['money'] = (float) $m[1];
        }
        if (preg_match('/lastAccountName:\s*[\'"]?([^\r\n\'"]+)[\'"]?/i', $yaml, $m)) {
            $result['last_known_name'] = trim($m[1]);
        }
    }

    /**
     * Format NBT inventory items array into clean JSON item representation.
     * Supports both legacy Minecraft (1.8 - 1.20.4 tag) and modern (1.20.5+ / 1.21+ components).
     */
    private function formatItemList(array $rawItems): array
    {
        $items = [];
        foreach ($rawItems as $item) {
            if (!is_array($item)) continue;

            $slot = null;
            if (isset($item['Slot'])) {
                $slot = (int) $item['Slot'];
            } elseif (isset($item['slot'])) {
                $slot = (int) $item['slot'];
            }
            if ($slot === null) continue;

            if ($slot < 0) {
                // E.g. offhand is -106 -> maps to 150
                $slot = 256 + $slot;
            }

            $id = (string) ($item['id'] ?? ($item['Id'] ?? 'minecraft:air'));
            if ($id === 'minecraft:air' || $id === 'air') continue;

            // In 1.20.5+, Count was renamed to count (int)
            $count = (int) ($item['count'] ?? ($item['Count'] ?? 1));
            if ($count <= 0) $count = 1;

            $tag = $item['tag'] ?? [];
            $components = $item['components'] ?? [];

            $displayName = null;
            $lore = [];
            $enchantments = [];
            $damage = 0;

            // 1. Check legacy tag (Minecraft <= 1.20.4)
            if (is_array($tag)) {
                if (isset($tag['display']['Name'])) {
                    $rawName = (string) $tag['display']['Name'];
                    $nameJson = json_decode($rawName, true);
                    $displayName = is_array($nameJson) ? ($nameJson['text'] ?? $rawName) : $rawName;
                }
                if (!empty($tag['display']['Lore']) && is_array($tag['display']['Lore'])) {
                    foreach ($tag['display']['Lore'] as $l) {
                        $lJson = json_decode((string) $l, true);
                        $lore[] = is_array($lJson) ? ($lJson['text'] ?? (string) $l) : (string) $l;
                    }
                }
                $enchList = $tag['Enchantments'] ?? $tag['ench'] ?? [];
                if (is_array($enchList)) {
                    foreach ($enchList as $ench) {
                        if (is_array($ench)) {
                            $enchantments[] = [
                                'id' => str_replace('minecraft:', '', (string) ($ench['id'] ?? '')),
                                'lvl' => (int) ($ench['lvl'] ?? 1),
                            ];
                        }
                    }
                }
                if (isset($tag['Damage'])) {
                    $damage = (int) $tag['Damage'];
                }
            }

            // 2. Check modern components (Minecraft >= 1.20.5 / 1.21)
            if (is_array($components)) {
                if (isset($components['minecraft:custom_name'])) {
                    $rawName = (string) $components['minecraft:custom_name'];
                    $nameJson = json_decode($rawName, true);
                    $displayName = is_array($nameJson) ? ($nameJson['text'] ?? $rawName) : $rawName;
                }
                if (isset($components['minecraft:lore']) && is_array($components['minecraft:lore'])) {
                    foreach ($components['minecraft:lore'] as $l) {
                        $lJson = json_decode((string) $l, true);
                        $lore[] = is_array($lJson) ? ($lJson['text'] ?? (string) $l) : (string) $l;
                    }
                }
                if (isset($components['minecraft:enchantments']['levels']) && is_array($components['minecraft:enchantments']['levels'])) {
                    foreach ($components['minecraft:enchantments']['levels'] as $enchId => $lvl) {
                        $enchantments[] = [
                            'id' => str_replace('minecraft:', '', (string) $enchId),
                            'lvl' => (int) $lvl,
                        ];
                    }
                }
                if (isset($components['minecraft:damage'])) {
                    $damage = (int) $components['minecraft:damage'];
                }
            }

            if (empty($displayName)) {
                $cleanId = str_replace('minecraft:', '', $id);
                $displayName = ucwords(str_replace('_', ' ', $cleanId));
            }

            $items[] = [
                'slot' => $slot,
                'id' => $id,
                'clean_id' => str_replace('minecraft:', '', $id),
                'count' => $count,
                'name' => $displayName,
                'damage' => $damage,
                'enchantments' => $enchantments,
                'lore' => $lore,
            ];
        }

        return $items;
    }

    /**
     * Resolve best hosts and ping server (handles Bedrock RakNet UDP & Java TCP SLP).
     */
    private function queryServerStatus(Server $server, int $port, string $category = 'java'): ?array
    {
        $hosts = [];
        // Localhost first: responds in < 1ms on panel nodes
        $hosts[] = '127.0.0.1';

        $allocation = $server->allocation;
        if ($allocation) {
            if (!empty($allocation->ip) && $allocation->ip !== '0.0.0.0' && $allocation->ip !== '127.0.0.1') {
                $hosts[] = $allocation->ip;
            }
            if (!empty($allocation->alias)) {
                $hosts[] = $allocation->alias;
            }
        }
        if (!empty($server->node) && !empty($server->node->fqdn)) {
            $hosts[] = $server->node->fqdn;
        }
        $hosts = array_values(array_unique(array_filter($hosts)));

        foreach ($hosts as $host) {
            if ($category === 'bedrock') {
                $res = $this->pingBedrockServer($host, $port, 0.25);
                if ($res !== null) return $res;
            } else {
                $res = $this->pingMinecraftServer($host, $port, 0.25);
                if ($res !== null) return $res;
            }
        }

        return null;
    }

    /**
     * Bedrock RakNet Unconnected Ping via UDP socket.
     */
    private function pingBedrockServer(string $host, int $port, float $timeout = 0.8): ?array
    {
        $socket = @socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
        if (!$socket) {
            return null;
        }

        @socket_set_option($socket, SOL_SOCKET, SO_RCVTIMEO, [
            'sec' => (int) $timeout,
            'usec' => (int) (($timeout - (int) $timeout) * 1000000),
        ]);

        $timeMs = (int) (microtime(true) * 1000);
        $magic = "\x00\xff\xff\x00\xfe\xfe\xfe\xfe\xfd\xfd\xfd\xfd\x12\x34\x56\x78";
        $packet = "\x01" . pack('J', $timeMs) . $magic . pack('J', 2);

        @socket_sendto($socket, $packet, strlen($packet), 0, $host, $port);

        $buf = '';
        $from = '';
        $fromPort = 0;
        $bytes = @socket_recvfrom($socket, $buf, 4096, 0, $from, $fromPort);
        @socket_close($socket);

        if ($bytes === false || strlen($buf) < 35 || ord($buf[0]) !== 0x1c) {
            return null;
        }

        $payloadLen = unpack('n', substr($buf, 33, 2))[1] ?? 0;
        $data = substr($buf, 35, $payloadLen);
        $parts = explode(';', $data);

        return [
            'edition' => $parts[0] ?? 'MCPE',
            'motd' => $parts[1] ?? 'Bedrock Server',
            'protocol' => $parts[2] ?? '',
            'version' => $parts[3] ?? '',
            'players' => [
                'online' => (int) ($parts[4] ?? 0),
                'max' => (int) ($parts[5] ?? 10),
            ],
            'server_id' => $parts[6] ?? '',
            'level_name' => $parts[7] ?? 'world',
            'gamemode' => $parts[8] ?? 'Survival',
        ];
    }

    /**
     * Java Server List Ping (SLP) Implementation over TCP socket.
     */
    private function pingMinecraftServer(string $host, int $port, float $timeout = 0.8): ?array
    {
        $errno = 0;
        $errstr = '';
        $socket = @stream_socket_client("tcp://{$host}:{$port}", $errno, $errstr, $timeout);
        if (!$socket) {
            return null;
        }

        stream_set_timeout($socket, (int) $timeout, (int) (($timeout - (int) $timeout) * 1000000));

        // Handshake packet
        $data = "\x00";
        $data .= "\xFF\xFF\xFF\xFF\x07";
        $data .= $this->packVarInt(strlen($host)) . $host;
        $data .= pack('n', $port);
        $data .= "\x01";

        $packet = $this->packVarInt(strlen($data)) . $data;
        @fwrite($socket, $packet);

        // Status request packet
        @fwrite($socket, "\x01\x00");

        $length = $this->readVarIntFromStream($socket);
        if ($length <= 0) {
            @fclose($socket);
            return null;
        }

        $packetId = $this->readVarIntFromStream($socket);
        if ($packetId !== 0) {
            @fclose($socket);
            return null;
        }

        $stringLength = $this->readVarIntFromStream($socket);
        if ($stringLength <= 0 || $stringLength > 65536) {
            @fclose($socket);
            return null;
        }

        $jsonStr = '';
        $bytesRemaining = $stringLength;
        while ($bytesRemaining > 0 && !feof($socket)) {
            $chunk = @fread($socket, min(4096, $bytesRemaining));
            if ($chunk === false || strlen($chunk) === 0) break;
            $jsonStr .= $chunk;
            $bytesRemaining -= strlen($chunk);
        }

        @fclose($socket);

        if (empty($jsonStr)) {
            return null;
        }

        $decoded = json_decode($jsonStr, true);
        return is_array($decoded) ? $decoded : null;
    }

    private function packVarInt(int $value): string
    {
        $out = '';
        while (true) {
            if (($value & ~0x7F) === 0) {
                $out .= chr($value);
                return $out;
            }
            $out .= chr(($value & 0x7F) | 0x80);
            $value >>= 7;
        }
    }

    private function readVarIntFromStream($stream): int
    {
        $result = 0;
        $numRead = 0;
        while (true) {
            $char = @fread($stream, 1);
            if ($char === false || strlen($char) === 0) return -1;
            $byte = ord($char);
            $value = $byte & 0x7F;
            $result |= ($value << (7 * $numRead));
            $numRead++;
            if ($numRead > 5) return -1;
            if (($byte & 0x80) === 0) break;
        }
        return $result;
    }

    /**
     * Pure PHP Named Binary Tag (NBT) Parser.
     */
    private function parseNbt(string $data): array
    {
        $offset = 0;
        $length = strlen($data);
        if ($length < 3) {
            return ['type' => 0, 'name' => '', 'payload' => []];
        }

        return $this->readNbtTag($data, $offset, $length);
    }

    private function readNbtTag(string &$data, int &$offset, int $length): array
    {
        if ($offset >= $length) {
            return ['type' => 0, 'name' => '', 'payload' => null];
        }

        $tagType = ord($data[$offset++]);
        if ($tagType === 0) {
            return ['type' => 0, 'name' => '', 'payload' => null];
        }

        $nameLength = unpack('n', substr($data, $offset, 2))[1] ?? 0;
        $offset += 2;

        $name = '';
        if ($nameLength > 0) {
            $name = substr($data, $offset, $nameLength);
            $offset += $nameLength;
        }

        $payload = $this->readNbtPayload($tagType, $data, $offset, $length);

        return [
            'type' => $tagType,
            'name' => $name,
            'payload' => $payload,
        ];
    }

    private function readNbtPayload(int $type, string &$data, int &$offset, int $length)
    {
        switch ($type) {
            case 1: // TAG_Byte
                $val = unpack('c', substr($data, $offset, 1))[1] ?? 0;
                $offset += 1;
                return $val;

            case 2: // TAG_Short
                $u = unpack('n', substr($data, $offset, 2))[1] ?? 0;
                $offset += 2;
                return ($u >= 0x8000) ? $u - 0x10000 : $u;

            case 3: // TAG_Int
                $u = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $offset += 4;
                return ($u >= 0x80000000) ? $u - 0x100000000 : $u;

            case 4: // TAG_Long
                $high = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $low = unpack('N', substr($data, $offset + 4, 4))[1] ?? 0;
                $offset += 8;
                if (PHP_INT_SIZE >= 8) {
                    return ($high << 32) | ($low & 0xFFFFFFFF);
                }
                return "{$high}:{$low}";

            case 5: // TAG_Float
                $val = unpack('G', substr($data, $offset, 4))[1] ?? 0.0;
                $offset += 4;
                return $val;

            case 6: // TAG_Double
                $val = unpack('E', substr($data, $offset, 8))[1] ?? 0.0;
                $offset += 8;
                return $val;

            case 7: // TAG_Byte_Array
                $uLen = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $len = ($uLen >= 0x80000000) ? 0 : $uLen;
                $offset += 4;
                $bytes = substr($data, $offset, max(0, $len));
                $offset += max(0, $len);
                return $bytes;

            case 8: // TAG_String
                $len = unpack('n', substr($data, $offset, 2))[1] ?? 0;
                $offset += 2;
                $str = substr($data, $offset, max(0, $len));
                $offset += max(0, $len);
                return $str;

            case 9: // TAG_List
                $elemType = ord($data[$offset++]);
                $uCount = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $count = ($uCount >= 0x80000000) ? 0 : $uCount;
                $offset += 4;
                $list = [];
                for ($i = 0; $i < $count && $offset < $length; $i++) {
                    $list[] = $this->readNbtPayload($elemType, $data, $offset, $length);
                }
                return $list;

            case 10: // TAG_Compound
                $compound = [];
                while ($offset < $length) {
                    $subTagType = ord($data[$offset++]);
                    if ($subTagType === 0) {
                        break;
                    }
                    $nameLen = unpack('n', substr($data, $offset, 2))[1] ?? 0;
                    $offset += 2;
                    $subName = '';
                    if ($nameLen > 0) {
                        $subName = substr($data, $offset, $nameLen);
                        $offset += $nameLen;
                    }
                    $subPayload = $this->readNbtPayload($subTagType, $data, $offset, $length);
                    $compound[$subName] = $subPayload;
                }
                return $compound;

            case 11: // TAG_Int_Array
                $uLen = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $offset += 4;
                $len = ($uLen >= 0x80000000) ? 0 : $uLen;
                $ints = [];
                for ($i = 0; $i < $len && $offset < $length; $i++) {
                    $u = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                    $offset += 4;
                    $ints[] = ($u >= 0x80000000) ? $u - 0x100000000 : $u;
                }
                return $ints;

            case 12: // TAG_Long_Array
                $uLen = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $offset += 4;
                $len = ($uLen >= 0x80000000) ? 0 : $uLen;
                $longs = [];
                for ($i = 0; $i < $len && $offset < $length; $i++) {
                    $high = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                    $low = unpack('N', substr($data, $offset + 4, 4))[1] ?? 0;
                    $offset += 8;
                    $longs[] = ($high << 32) | ($low & 0xFFFFFFFF);
                }
                return $longs;

            default:
                return null;
        }
    }

    /**
     * Detect installed server software across all Minecraft editions (Java, Bedrock, Proxies).
     */
    public function detectServerSoftware(Server $server): array
    {
        // 1. Check software manifest (written by SoftwareInstaller)
        try {
            $rawManifest = $this->fileRepository->setServer($server)->getContent(self::MANIFEST_FILE);
            $manifest = json_decode($rawManifest, true);
            if (is_array($manifest) && !empty($manifest['software'])) {
                $softId = strtoupper($manifest['software']);
                $category = 'java';
                if (in_array($softId, ['BDS', 'BEDROCK', 'POCKETMINE', 'NUKKIT', 'POWERNUKKIT'])) {
                    $category = 'bedrock';
                } elseif (in_array($softId, ['BUNGEECORD', 'WATERFALL', 'VELOCITY', 'HEXACORD'])) {
                    $category = 'proxy';
                }
                return [
                    'id' => $softId,
                    'name' => $manifest['software_name'] ?? ucfirst(strtolower($softId)),
                    'category' => $category,
                    'version' => $manifest['version'] ?? null,
                    'build' => $manifest['build'] ?? null,
                    'supports_plugins' => in_array($softId, ['PAPER', 'PURPUR', 'SPIGOT', 'BUKKIT', 'FOLIA', 'POCKETMINE', 'NUKKIT', 'BUNGEECORD', 'VELOCITY', 'WATERFALL']),
                    'supports_mods' => in_array($softId, ['FORGE', 'NEOFORGE', 'FABRIC', 'QUILT', 'MOHIST', 'MAGMA', 'ARCLIGHT', 'CATSERVER']),
                    'config_file' => in_array($softId, ['BUNGEECORD', 'WATERFALL']) ? '/config.yml' : ($softId === 'VELOCITY' ? '/velocity.toml' : '/server.properties'),
                    'source' => 'manifest',
                ];
            }
        } catch (Throwable $e) {}

        // 2. Check Bedrock Dedicated Server (BDS)
        try {
            $isBds = false;
            try {
                $hasBedrockBin = $this->fileRepository->setServer($server)->getContent('/bedrock_server');
                if ($hasBedrockBin !== null) $isBds = true;
            } catch (Throwable $e) {}
            if (!$isBds) {
                try {
                    $hasAllowlist = $this->fileRepository->setServer($server)->getContent('/allowlist.json');
                    $hasPermissions = $this->fileRepository->setServer($server)->getContent('/permissions.json');
                    if ($hasAllowlist !== null || $hasPermissions !== null) $isBds = true;
                } catch (Throwable $e) {}
            }
            if ($isBds) {
                return [
                    'id' => 'BDS',
                    'name' => 'Bedrock Dedicated Server',
                    'category' => 'bedrock',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => false,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'bedrock_server',
                ];
            }
        } catch (Throwable $e) {}

        // 3. Check PocketMine-MP
        try {
            $hasPocketmine = false;
            try {
                $pm = $this->fileRepository->setServer($server)->getContent('/pocketmine.yml');
                if ($pm !== null) $hasPocketmine = true;
            } catch (Throwable $e) {}
            if ($hasPocketmine) {
                return [
                    'id' => 'POCKETMINE',
                    'name' => 'PocketMine-MP',
                    'category' => 'bedrock',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/pocketmine.yml',
                    'source' => 'pocketmine.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 4. Check Nukkit / PowerNukkit
        try {
            $hasNukkit = false;
            try {
                $nk = $this->fileRepository->setServer($server)->getContent('/nukkit.yml');
                if ($nk !== null) $hasNukkit = true;
            } catch (Throwable $e) {}
            if ($hasNukkit) {
                return [
                    'id' => 'NUKKIT',
                    'name' => 'Nukkit',
                    'category' => 'bedrock',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/nukkit.yml',
                    'source' => 'nukkit.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 5. Check Velocity Proxy
        try {
            $hasVelocity = false;
            try {
                $vel = $this->fileRepository->setServer($server)->getContent('/velocity.toml');
                if ($vel !== null) $hasVelocity = true;
            } catch (Throwable $e) {}
            if ($hasVelocity) {
                return [
                    'id' => 'VELOCITY',
                    'name' => 'Velocity',
                    'category' => 'proxy',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/velocity.toml',
                    'source' => 'velocity.toml',
                ];
            }
        } catch (Throwable $e) {}

        // 6. Check BungeeCord / Waterfall Proxy
        try {
            $hasBungee = false;
            try {
                $bng = $this->fileRepository->setServer($server)->getContent('/config.yml');
                if ($bng !== null && (str_contains($bng, 'listeners:') || str_contains($bng, 'ip_forward:'))) {
                    $hasBungee = true;
                }
            } catch (Throwable $e) {}
            if ($hasBungee) {
                return [
                    'id' => 'BUNGEECORD',
                    'name' => 'BungeeCord / Waterfall',
                    'category' => 'proxy',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/config.yml',
                    'source' => 'config.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 7. Check version_history.json (Paper / Purpur / Spigot / Folia)
        try {
            $rawHistory = $this->fileRepository->setServer($server)->getContent('/version_history.json');
            $history = json_decode($rawHistory, true);
            if (is_array($history) && !empty($history['currentVersion'])) {
                $raw = (string) $history['currentVersion'];
                $softName = 'Paper';
                $build = null;
                $mcVer = null;

                if (preg_match('/git-Purpur-(\d+)/i', $raw, $m)) {
                    $softName = 'Purpur';
                    $build = '#' . $m[1];
                } elseif (preg_match('/git-Paper-(\d+)/i', $raw, $m)) {
                    $softName = 'Paper';
                    $build = '#' . $m[1];
                } elseif (preg_match('/git-Folia-(\d+)/i', $raw, $m)) {
                    $softName = 'Folia';
                    $build = '#' . $m[1];
                } elseif (preg_match('/git-Spigot-([a-f0-9]+)/i', $raw, $m)) {
                    $softName = 'Spigot';
                    $build = substr($m[1], 0, 7);
                }

                if (preg_match('/\(MC:\s*([0-9\.]+)\)/i', $raw, $m)) {
                    $mcVer = $m[1];
                }

                return [
                    'id' => strtoupper($softName),
                    'name' => $softName,
                    'category' => 'java',
                    'version' => $mcVer,
                    'build' => $build,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'version_history.json',
                ];
            }
        } catch (Throwable $e) {}

        // 8. Check Purpur / Paper / Spigot / Folia YAML files
        try {
            $isPurpur = false;
            try {
                $py = $this->fileRepository->setServer($server)->getContent('/purpur.yml');
                if ($py !== null) $isPurpur = true;
            } catch (Throwable $e) {}
            if ($isPurpur) {
                return [
                    'id' => 'PURPUR',
                    'name' => 'Purpur',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'purpur.yml',
                ];
            }

            $isPaper = false;
            try {
                $pay = $this->fileRepository->setServer($server)->getContent('/paper.yml');
                if ($pay !== null) $isPaper = true;
            } catch (Throwable $e) {}
            if (!$isPaper) {
                try {
                    $pay = $this->fileRepository->setServer($server)->getContent('/config/paper-global.yml');
                    if ($pay !== null) $isPaper = true;
                } catch (Throwable $e) {}
            }
            if ($isPaper) {
                return [
                    'id' => 'PAPER',
                    'name' => 'Paper',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'paper.yml',
                ];
            }

            $isFolia = false;
            try {
                $fy = $this->fileRepository->setServer($server)->getContent('/folia.yml');
                if ($fy !== null) $isFolia = true;
            } catch (Throwable $e) {}
            if ($isFolia) {
                return [
                    'id' => 'FOLIA',
                    'name' => 'Folia',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'folia.yml',
                ];
            }

            $isSpigot = false;
            try {
                $sy = $this->fileRepository->setServer($server)->getContent('/spigot.yml');
                if ($sy !== null) $isSpigot = true;
            } catch (Throwable $e) {}
            if ($isSpigot) {
                return [
                    'id' => 'SPIGOT',
                    'name' => 'Spigot',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'spigot.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 9. Check Forge / NeoForge / Fabric / Quilt in libraries directory
        try {
            $forgeItems = $this->fileRepository->setServer($server)->getDirectory('/libraries/net/minecraftforge/forge');
            if (is_array($forgeItems) && !empty($forgeItems)) {
                $ver = null;
                $bld = null;
                foreach ($forgeItems as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $parts = explode('-', $n, 2);
                        $ver = $parts[0] ?? $n;
                        $bld = $parts[1] ?? null;
                        break;
                    }
                }
                return [
                    'id' => 'FORGE',
                    'name' => 'Forge',
                    'category' => 'java',
                    'version' => $ver,
                    'build' => $bld,
                    'supports_plugins' => false,
                    'supports_mods' => true,
                    'config_file' => '/server.properties',
                    'source' => 'libraries/forge',
                ];
            }
        } catch (Throwable $e) {}

        try {
            $neoItems = $this->fileRepository->setServer($server)->getDirectory('/libraries/net/neoforged/neoforge');
            if (is_array($neoItems) && !empty($neoItems)) {
                $bld = null;
                foreach ($neoItems as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $bld = $n;
                        break;
                    }
                }
                return [
                    'id' => 'NEOFORGE',
                    'name' => 'NeoForge',
                    'category' => 'java',
                    'version' => null,
                    'build' => $bld,
                    'supports_plugins' => false,
                    'supports_mods' => true,
                    'config_file' => '/server.properties',
                    'source' => 'libraries/neoforge',
                ];
            }
        } catch (Throwable $e) {}

        try {
            $fabricItems = $this->fileRepository->setServer($server)->getDirectory('/libraries/net/fabricmc/fabric-loader');
            if (is_array($fabricItems) && !empty($fabricItems)) {
                $bld = null;
                foreach ($fabricItems as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $bld = $n;
                        break;
                    }
                }
                return [
                    'id' => 'FABRIC',
                    'name' => 'Fabric',
                    'category' => 'java',
                    'version' => null,
                    'build' => $bld,
                    'supports_plugins' => false,
                    'supports_mods' => true,
                    'config_file' => '/server.properties',
                    'source' => 'libraries/fabric',
                ];
            }
        } catch (Throwable $e) {}

        // 10. Check Hybrid servers (Mohist / Magma / Arclight / CatServer)
        try {
            foreach (['mohist.yml' => 'Mohist', 'magma.yml' => 'Magma', 'arclight.conf' => 'Arclight', 'catserver.yml' => 'CatServer'] as $f => $name) {
                try {
                    $c = $this->fileRepository->setServer($server)->getContent("/{$f}");
                    if ($c !== null) {
                        return [
                            'id' => strtoupper($name),
                            'name' => $name,
                            'category' => 'java',
                            'version' => null,
                            'build' => null,
                            'supports_plugins' => true,
                            'supports_mods' => true,
                            'config_file' => '/server.properties',
                            'source' => $f,
                        ];
                    }
                } catch (Throwable $e) {}
            }
        } catch (Throwable $e) {}

        // 11. Check logs/latest.log startup signatures
        try {
            $logContent = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
            if (!empty($logContent)) {
                $sample = substr($logContent, 0, 16384);
                if (preg_match('/This server is running ([A-Za-z0-9_-]+) version git-\1-(\d+)\s*\(MC:\s*([0-9\.]+)\)/i', $sample, $m)) {
                    $name = ucfirst(strtolower($m[1]));
                    return [
                        'id' => strtoupper($name),
                        'name' => $name,
                        'category' => 'java',
                        'version' => $m[3],
                        'build' => '#' . $m[2],
                        'supports_plugins' => true,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/Loading Minecraft ([0-9\.]+) with Fabric Loader ([0-9\.]+)/i', $sample, $m)) {
                    return [
                        'id' => 'FABRIC',
                        'name' => 'Fabric',
                        'category' => 'java',
                        'version' => $m[1],
                        'build' => $m[2],
                        'supports_plugins' => false,
                        'supports_mods' => true,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/MinecraftForge v([0-9\.]+) Initialized/i', $sample, $m)) {
                    return [
                        'id' => 'FORGE',
                        'name' => 'Forge',
                        'category' => 'java',
                        'version' => null,
                        'build' => $m[1],
                        'supports_plugins' => false,
                        'supports_mods' => true,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/Starting Bedrock Dedicated Server/i', $sample) || preg_match('/IPv4 supported/i', $sample)) {
                    return [
                        'id' => 'BDS',
                        'name' => 'Bedrock Dedicated Server',
                        'category' => 'bedrock',
                        'version' => null,
                        'build' => null,
                        'supports_plugins' => false,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/Starting minecraft server version ([0-9\.]+)/i', $sample, $m)) {
                    return [
                        'id' => 'VANILLA',
                        'name' => 'Vanilla Minecraft',
                        'category' => 'java',
                        'version' => $m[1],
                        'build' => null,
                        'supports_plugins' => false,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
            }
        } catch (Throwable $e) {}

        // 12. Check if server.properties exists
        try {
            $props = $this->fileRepository->setServer($server)->getContent('/server.properties');
            if (!empty($props)) {
                if (str_contains($props, 'server-portv6') || str_contains($props, 'allow-cheats')) {
                    return [
                        'id' => 'BDS',
                        'name' => 'Bedrock Dedicated Server',
                        'category' => 'bedrock',
                        'version' => null,
                        'build' => null,
                        'supports_plugins' => false,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'server.properties',
                    ];
                }
                return [
                    'id' => 'VANILLA',
                    'name' => 'Vanilla Minecraft',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => false,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'server.properties',
                ];
            }
        } catch (Throwable $e) {}

        return [
            'id' => 'CUSTOM',
            'name' => 'Custom Server',
            'category' => 'java',
            'version' => null,
            'build' => null,
            'supports_plugins' => false,
            'supports_mods' => false,
            'config_file' => '/server.properties',
            'source' => 'default',
        ];
    }
}
