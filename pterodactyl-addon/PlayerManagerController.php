<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Repositories\Wings\DaemonCommandRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class PlayerManagerController extends ClientApiController
{
    protected DaemonFileRepository $fileRepository;
    protected DaemonCommandRepository $commandRepository;

    public const STEVE_SKIN_URL = 'https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/entity/player/wide/steve.png';
    public const STEVE_AVATAR_URL = 'https://mc-heads.net/avatar/MHF_Steve/64';

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

        // 1. Read server.properties
        $properties = $this->readServerProperties($server);
        $maxPlayers = isset($properties['max-players']) ? (int) $properties['max-players'] : 20;
        $onlineMode = isset($properties['online-mode']) ? strtolower($properties['online-mode']) === 'true' : true;
        $levelName = $properties['level-name'] ?? 'world';

        // 2. Resolve Server Allocation Host and Port
        $host = '127.0.0.1';
        $port = 25565;
        $allocation = $server->allocation;
        if ($allocation) {
            $port = (int) $allocation->port;
            $host = !empty($allocation->alias) ? $allocation->alias : $allocation->ip;
        }

        // 3. Check if SkinsRestorer plugin is installed
        $hasSkinsRestorer = $this->checkSkinsRestorerInstalled($server);

        // 4. Read usercache.json (All known players)
        $userCache = $this->readUserCache($server);

        // 5. Read ops.json
        $opsList = $this->readOpsList($server);

        // 6. Read banned-players.json and banned-ips.json
        $bannedPlayersRaw = $this->readBannedPlayers($server);
        $bannedIps = $this->readBannedIps($server);

        // 7. Perform Server List Ping (SLP) for real-time online players
        $slpResult = $this->pingMinecraftServer('127.0.0.1', $port, 1.2);
        if (!$slpResult && $host !== '127.0.0.1') {
            $slpResult = $this->pingMinecraftServer($host, $port, 1.2);
        }

        $serverOnline = ($slpResult !== null);
        $onlineCount = 0;
        $slpOnlinePlayers = [];

        if ($slpResult) {
            $onlineCount = (int) ($slpResult['players']['online'] ?? 0);
            if (isset($slpResult['players']['max'])) {
                $maxPlayers = (int) $slpResult['players']['max'];
            }
            if (!empty($slpResult['players']['sample']) && is_array($slpResult['players']['sample'])) {
                foreach ($slpResult['players']['sample'] as $s) {
                    if (!empty($s['name']) && $s['name'] !== 'Anonymous Player') {
                        $slpOnlinePlayers[] = [
                            'name' => $s['name'],
                            'id' => $s['id'] ?? null,
                        ];
                    }
                }
            }
        }

        // 8. Supplement online players from latest.log if sample is incomplete
        $logOnlinePlayers = $this->getOnlinePlayersFromLog($server);
        $mergedOnlineNames = [];

        foreach ($slpOnlinePlayers as $sp) {
            $mergedOnlineNames[strtolower($sp['name'])] = $sp['name'];
        }
        foreach ($logOnlinePlayers as $lp) {
            $mergedOnlineNames[strtolower($lp)] = $lp;
        }

        // If server is reported offline and no log players, count is 0
        if (!$serverOnline && empty($mergedOnlineNames)) {
            $onlineCount = 0;
        } elseif ($onlineCount === 0 && !empty($mergedOnlineNames)) {
            $onlineCount = count($mergedOnlineNames);
        }

        // Map online players to detailed card objects
        $onlinePlayers = [];
        foreach ($mergedOnlineNames as $pName) {
            $uuid = $this->resolvePlayerUuid($pName, $userCache, $slpOnlinePlayers);
            $skinInfo = $this->resolvePlayerSkin($pName, $uuid, $onlineMode, $hasSkinsRestorer, $server);
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

        // Map banned players
        $bannedPlayers = [];
        foreach ($bannedPlayersRaw as $bp) {
            $bpName = $bp['name'] ?? 'Unknown';
            $bpUuid = $bp['uuid'] ?? '';
            $skinInfo = $this->resolvePlayerSkin($bpName, $bpUuid, $onlineMode, $hasSkinsRestorer, $server);
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

        // Map all recorded players from usercache
        $allPlayers = [];
        $bannedNameMap = [];
        foreach ($bannedPlayersRaw as $b) {
            if (!empty($b['name'])) {
                $bannedNameMap[strtolower($b['name'])] = true;
            }
        }

        foreach ($userCache as $uc) {
            $uName = $uc['name'] ?? '';
            if (empty($uName)) continue;
            $uUuid = $uc['uuid'] ?? '';
            $isOnline = isset($mergedOnlineNames[strtolower($uName)]);
            $isBanned = isset($bannedNameMap[strtolower($uName)]);
            $isOp = $this->isPlayerOp($uName, $uUuid, $opsList);
            $skinInfo = $this->resolvePlayerSkin($uName, $uUuid, $onlineMode, $hasSkinsRestorer, $server);

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

        return response()->json([
            'success' => true,
            'server_online' => $serverOnline,
            'online_count' => $onlineCount,
            'max_players' => $maxPlayers,
            'online_mode' => $onlineMode,
            'has_skinsrestorer' => $hasSkinsRestorer,
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

        $playerName = trim((string) $request->query('player', ''));
        $playerUuid = trim((string) $request->query('uuid', ''));

        $properties = $this->readServerProperties($server);
        $onlineMode = isset($properties['online-mode']) ? strtolower($properties['online-mode']) === 'true' : true;
        $levelName = $properties['level-name'] ?? 'world';
        $hasSkinsRestorer = $this->checkSkinsRestorerInstalled($server);

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

        $opsList = $this->readOpsList($server);
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

        $skinInfo = $this->resolvePlayerSkin($playerName, $playerUuid, $onlineMode, $hasSkinsRestorer, $server);

        // Read playerdata NBT file
        $nbtData = $this->readPlayerNbtData($server, $playerUuid, $playerName, $levelName);

        return response()->json([
            'success' => true,
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
            'has_skinsrestorer' => $hasSkinsRestorer,
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

        $action = strtolower(trim((string) $request->input('action', '')));
        $player = trim((string) $request->input('player', ''));
        $uuid = trim((string) $request->input('uuid', ''));
        $reason = trim((string) $request->input('reason', ''));
        $gamemode = strtolower(trim((string) $request->input('gamemode', 'survival')));
        $message = trim((string) $request->input('message', ''));
        $banIp = (bool) $request->input('ban_ip', false);

        if (empty($player) && empty($uuid)) {
            return response()->json(['error' => 'Player username or UUID is required.'], 400);
        }

        // Clean player name to prevent command injection
        $cleanPlayer = preg_replace('/[^a-zA-Z0-9_]/', '', $player);
        if (empty($cleanPlayer)) {
            $cleanPlayer = $player;
        }

        $cleanReason = preg_replace('/[\r\n"]/', ' ', $reason);
        $executedCommands = [];

        try {
            switch ($action) {
                case 'op':
                    $cmd = "op {$cleanPlayer}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer} has been granted Operator status.";
                    break;

                case 'deop':
                    $cmd = "deop {$cleanPlayer}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Operator status revoked for {$cleanPlayer}.";
                    break;

                case 'kick':
                    $kickReason = !empty($cleanReason) ? $cleanReason : 'Kicked by server administrator.';
                    $cmd = "kick {$cleanPlayer} {$kickReason}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer} was kicked from the server.";
                    break;

                case 'ban':
                    $banReason = !empty($cleanReason) ? $cleanReason : 'Banned by server administrator.';
                    $cmd = "ban {$cleanPlayer} {$banReason}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;

                    if ($banIp) {
                        $cmdIp = "ban-ip {$cleanPlayer} {$banReason}";
                        try {
                            $this->sendCommand($server, $cmdIp);
                            $executedCommands[] = $cmdIp;
                        } catch (Exception $ex) {}
                    }
                    $msg = "Player {$cleanPlayer} has been banned.";
                    break;

                case 'unban':
                case 'pardon':
                    $cmd = "pardon {$cleanPlayer}";
                    try {
                        $this->sendCommand($server, $cmd);
                        $executedCommands[] = $cmd;
                    } catch (Exception $e) {}

                    // Also remove directly from banned-players.json to guarantee unban even if server is offline
                    $this->removeBannedPlayerRecord($server, $cleanPlayer, $uuid);

                    if ($banIp) {
                        try {
                            $cmdIp = "pardon-ip {$cleanPlayer}";
                            $this->sendCommand($server, $cmdIp);
                            $executedCommands[] = $cmdIp;
                        } catch (Exception $ex) {}
                    }
                    $msg = "Player {$cleanPlayer} has been unbanned.";
                    break;

                case 'heal':
                    // Instant health fills hearts to max instantly in vanilla Minecraft
                    $cmdHealth = "effect give {$cleanPlayer} minecraft:instant_health 1 255";
                    $cmdSat = "effect give {$cleanPlayer} minecraft:saturation 1 255";
                    $this->sendCommand($server, $cmdHealth);
                    $this->sendCommand($server, $cmdSat);
                    $executedCommands[] = $cmdHealth;
                    $executedCommands[] = $cmdSat;
                    try {
                        $this->sendCommand($server, "heal {$cleanPlayer}");
                    } catch (Exception $ex) {}
                    $msg = "Player {$cleanPlayer} has been fully healed and fed.";
                    break;

                case 'feed':
                    $cmdSat = "effect give {$cleanPlayer} minecraft:saturation 1 255";
                    $this->sendCommand($server, $cmdSat);
                    $executedCommands[] = $cmdSat;
                    try {
                        $this->sendCommand($server, "feed {$cleanPlayer}");
                    } catch (Exception $ex) {}
                    $msg = "Player {$cleanPlayer} has been fully fed.";
                    break;

                case 'clear':
                    $cmd = "clear {$cleanPlayer}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer}'s inventory was cleared.";
                    break;

                case 'kill':
                    $cmd = "kill {$cleanPlayer}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Player {$cleanPlayer} was killed.";
                    break;

                case 'gamemode':
                    $allowedModes = ['survival', 'creative', 'adventure', 'spectator'];
                    if (!in_array($gamemode, $allowedModes)) {
                        $gamemode = 'survival';
                    }
                    $cmd = "gamemode {$gamemode} {$cleanPlayer}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Gamemode for {$cleanPlayer} changed to " . ucfirst($gamemode) . ".";
                    break;

                case 'message':
                case 'whisper':
                case 'tell':
                    $cleanMsg = preg_replace('/[\r\n"]/', ' ', $message);
                    $cmd = "tell {$cleanPlayer} {$cleanMsg}";
                    $this->sendCommand($server, $cmd);
                    $executedCommands[] = $cmd;
                    $msg = "Message sent to {$cleanPlayer}.";
                    break;

                default:
                    return response()->json(['error' => "Unsupported action '{$action}'."], 400);
            }

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
     * Helper to read server.properties.
     */
    private function readServerProperties(Server $server): array
    {
        $properties = [];
        try {
            $raw = $this->fileRepository->setServer($server)->getContent('/server.properties');
            $lines = explode("\n", str_replace("\r\n", "\n", $raw));
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (empty($trimmed) || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '!')) {
                    continue;
                }
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $properties[trim($parts[0])] = trim($parts[1]);
                }
            }
        } catch (Exception $e) {}
        return $properties;
    }

    /**
     * Check if SkinsRestorer plugin is installed on the server.
     */
    private function checkSkinsRestorerInstalled(Server $server): bool
    {
        try {
            $srDir = $this->fileRepository->setServer($server)->getDirectory('/plugins/SkinsRestorer');
            if (!empty($srDir)) {
                return true;
            }
        } catch (Exception $e) {}

        try {
            $plugins = $this->fileRepository->setServer($server)->getDirectory('/plugins');
            if (is_array($plugins)) {
                foreach ($plugins as $p) {
                    $name = strtolower($p['name'] ?? '');
                    if (str_contains($name, 'skinsrestorer')) {
                        return true;
                    }
                }
            }
        } catch (Exception $e) {}

        return false;
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
     * Read ops.json
     */
    private function readOpsList(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/ops.json');
            $decoded = json_decode($content, true);
            return is_array($decoded) ? $decoded : [];
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * Read banned-players.json
     */
    private function readBannedPlayers(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/banned-players.json');
            $decoded = json_decode($content, true);
            return is_array($decoded) ? $decoded : [];
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * Read banned-ips.json
     */
    private function readBannedIps(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/banned-ips.json');
            $decoded = json_decode($content, true);
            return is_array($decoded) ? $decoded : [];
        } catch (Exception $e) {
            return [];
        }
    }

    /**
     * Check if a player is in ops.json
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
     * Resolve skin, avatar, and 3D render preview based on:
     * - SkinsRestorer assigned skin
     * - Cracked account without skin -> Classic Steve
     * - Premium account -> Official Mojang Skin
     */
    private function resolvePlayerSkin(
        string $playerName,
        string $playerUuid,
        bool $onlineMode,
        bool $hasSkinsRestorer,
        Server $server
    ): array {
        $skinRestorerSkin = null;

        if ($hasSkinsRestorer) {
            $skinRestorerSkin = $this->getSkinsRestorerSkinName($server, $playerName, $playerUuid);
        }

        if (!empty($skinRestorerSkin)) {
            $encodedSkin = urlencode($skinRestorerSkin);
            return [
                'skin_type' => 'skinsrestorer',
                'skin_name' => $skinRestorerSkin,
                'is_cracked' => !$onlineMode,
                'skin_url' => "https://mc-heads.net/skin/{$encodedSkin}",
                'avatar_url' => "https://mc-heads.net/avatar/{$encodedSkin}/64",
                'render_3d_url' => "https://visage.surgeplay.com/full/512/{$encodedSkin}",
            ];
        }

        $isCracked = !$onlineMode;

        if ($isCracked) {
            return [
                'skin_type' => 'steve',
                'skin_name' => 'Steve',
                'is_cracked' => true,
                'skin_url' => self::STEVE_SKIN_URL,
                'avatar_url' => self::STEVE_AVATAR_URL,
                'render_3d_url' => "https://visage.surgeplay.com/full/512/MHF_Steve",
            ];
        }

        $encodedName = urlencode($playerName);
        return [
            'skin_type' => 'premium',
            'skin_name' => $playerName,
            'is_cracked' => false,
            'skin_url' => "https://mc-heads.net/skin/{$encodedName}",
            'avatar_url' => "https://mc-heads.net/avatar/{$encodedName}/64",
            'render_3d_url' => "https://visage.surgeplay.com/full/512/{$encodedName}",
        ];
    }

    /**
     * Inspect SkinsRestorer player cache files to get assigned skin name.
     */
    private function getSkinsRestorerSkinName(Server $server, string $playerName, string $playerUuid): ?string
    {
        $possiblePaths = [
            "/plugins/SkinsRestorer/players/" . strtolower($playerName) . ".player",
            "/plugins/SkinsRestorer/players/" . $playerName . ".player",
            "/plugins/SkinsRestorer/Players/" . strtolower($playerName) . ".player",
            "/plugins/SkinsRestorer/Players/" . $playerName . ".player",
            "/plugins/SkinsRestorer/players/" . $playerUuid . ".player",
            "/plugins/SkinsRestorer/Players/" . $playerUuid . ".player",
            "/plugins/SkinsRestorer/players/" . strtolower($playerName) . ".json",
        ];

        foreach ($possiblePaths as $path) {
            try {
                $data = $this->fileRepository->setServer($server)->getContent($path);
                if (!empty($data)) {
                    $trimmed = trim($data);
                    if (preg_match('/^[a-zA-Z0-9_]{2,16}$/', $trimmed)) {
                        return $trimmed;
                    }
                    $json = json_decode($trimmed, true);
                    if (is_array($json)) {
                        if (!empty($json['skinName'])) {
                            return (string) $json['skinName'];
                        }
                        if (!empty($json['profileName'])) {
                            return (string) $json['profileName'];
                        }
                    }
                }
            } catch (Exception $e) {}
        }

        return null;
    }

    /**
     * Remove player from banned-players.json directly (useful if server is offline).
     */
    private function removeBannedPlayerRecord(Server $server, string $name, string $uuid): void
    {
        try {
            $raw = $this->fileRepository->setServer($server)->getContent('/banned-players.json');
            $banned = json_decode($raw, true);
            if (!is_array($banned)) return;

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
        } catch (Exception $e) {}
    }

    /**
     * Inspect latest.log to track currently joined players.
     */
    private function getOnlinePlayersFromLog(Server $server): array
    {
        $online = [];
        try {
            $raw = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
            if (empty($raw)) return [];

            $lines = explode("\n", str_replace("\r\n", "\n", $raw));
            $tail = array_slice($lines, -300);

            foreach ($tail as $line) {
                if (preg_match('/:\s+([a-zA-Z0-9_]{2,16})\[.*?\]\s+logged in/i', $line, $m)) {
                    $online[strtolower($m[1])] = $m[1];
                } elseif (preg_match('/:\s+([a-zA-Z0-9_]{2,16})\s+joined the game/i', $line, $m)) {
                    $online[strtolower($m[1])] = $m[1];
                }

                if (preg_match('/:\s+([a-zA-Z0-9_]{2,16})\s+lost connection/i', $line, $m)) {
                    unset($online[strtolower($m[1])]);
                } elseif (preg_match('/:\s+([a-zA-Z0-9_]{2,16})\s+left the game/i', $line, $m)) {
                    unset($online[strtolower($m[1])]);
                }
            }
        } catch (Exception $e) {}

        return array_values($online);
    }

    /**
     * Read playerdata/<uuid>.dat and extract inventory and player stats using pure PHP NBT parser.
     */
    private function readPlayerNbtData(Server $server, string $playerUuid, string $playerName, string $levelName = 'world'): array
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
        ];

        if (empty($playerUuid)) {
            return $result;
        }

        $possiblePaths = [
            "/{$levelName}/playerdata/{$playerUuid}.dat",
            "/world/playerdata/{$playerUuid}.dat",
            "/world_nether/playerdata/{$playerUuid}.dat",
        ];

        $rawBytes = null;
        foreach ($possiblePaths as $path) {
            try {
                $content = $this->fileRepository->setServer($server)->getContent($path);
                if (!empty($content)) {
                    $rawBytes = $content;
                    break;
                }
            } catch (Exception $e) {}
        }

        if (empty($rawBytes)) {
            return $result;
        }

        $decompressed = @gzdecode($rawBytes);
        if ($decompressed === false) {
            $decompressed = $rawBytes;
        }

        try {
            $parsedNbt = $this->parseNbt($decompressed);
            if (!empty($parsedNbt['payload']) && is_array($parsedNbt['payload'])) {
                $root = $parsedNbt['payload'];

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

        return $result;
    }

    /**
     * Format NBT inventory items array into clean JSON item representation.
     */
    private function formatItemList(array $rawItems): array
    {
        $items = [];
        foreach ($rawItems as $item) {
            if (!is_array($item) || !isset($item['Slot'])) continue;

            $slot = (int) $item['Slot'];
            if ($slot < 0) {
                $slot = 256 + $slot;
            }

            $id = (string) ($item['id'] ?? 'minecraft:air');
            $count = (int) ($item['Count'] ?? 1);

            $tag = $item['tag'] ?? [];
            $displayName = null;
            $lore = [];
            $enchantments = [];
            $damage = 0;

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
     * Server List Ping (SLP) Implementation.
     */
    private function pingMinecraftServer(string $host, int $port, float $timeout = 1.2): ?array
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
                $val = unpack('s', pack('s', unpack('n', substr($data, $offset, 2))[1] ?? 0))[1] ?? 0;
                $offset += 2;
                return $val;

            case 3: // TAG_Int
                $val = unpack('l', pack('l', unpack('N', substr($data, $offset, 4))[1] ?? 0))[1] ?? 0;
                $offset += 4;
                return $val;

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
                $len = unpack('N', substr($data, $offset, 4))[1] ?? 0;
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
                $count = unpack('N', substr($data, $offset, 4))[1] ?? 0;
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
                $len = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $offset += 4;
                $ints = [];
                for ($i = 0; $i < $len && $offset < $length; $i++) {
                    $ints[] = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                    $offset += 4;
                }
                return $ints;

            case 12: // TAG_Long_Array
                $len = unpack('N', substr($data, $offset, 4))[1] ?? 0;
                $offset += 4;
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
}
