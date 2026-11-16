<?php

namespace Pterodactyl\Services\Demo;

use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Pterodactyl\Http\Controllers\Api\Client\Servers\OptionsController;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;

class DemoPanelService
{
    public const DEMO_DEFAULT_EMAIL = 'demo@gmail.com';
    public const DEMO_DEFAULT_ALLOCATION = 'play.demo-server.net:25565';
    public const DEMO_DISK_BYTES = 1482043392; // ~1.38 GiB

    /**
     * Determine whether the given user is a demo preview account.
     */
    public function isDemoUser(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ($this->hasColumn('users', 'is_demo') && !empty($user->is_demo)) {
            return true;
        }

        $configuredEmail = trim((string) env('DEMO_ACCOUNT_EMAIL', self::DEMO_DEFAULT_EMAIL));
        return $configuredEmail !== '' && strcasecmp((string) $user->email, $configuredEmail) === 0;
    }

    /**
     * Determine whether an email address belongs to a demo preview account.
     */
    public function isDemoEmail(string $email): bool
    {
        $clean = trim($email);
        if ($clean === '') {
            return false;
        }

        $configuredEmail = trim((string) env('DEMO_ACCOUNT_EMAIL', self::DEMO_DEFAULT_EMAIL));
        if ($configuredEmail !== '' && strcasecmp($clean, $configuredEmail) === 0) {
            return true;
        }

        if ($this->hasColumn('users', 'is_demo')) {
            return User::query()
                ->whereRaw('LOWER(email) = ?', [mb_strtolower($clean)])
                ->where('is_demo', true)
                ->exists();
        }

        return false;
    }

    /**
     * Determine whether the given server is a demo dummy server.
     */
    public function isDemoServer(?Server $server): bool
    {
        if (!$server) {
            return false;
        }

        if ($this->hasColumn('servers', 'is_demo') && !empty($server->is_demo)) {
            return true;
        }

        return $server->user ? $this->isDemoUser($server->user) : false;
    }

    /**
     * Check whether the authenticated user has access to the given server.
     */
    public function userCanAccessServer(?User $user, Server $server): bool
    {
        if (!$user) {
            return false;
        }

        if ((int) $user->id === (int) $server->owner_id || !empty($user->root_admin)) {
            return true;
        }

        return $server->subusers()->where('user_id', $user->id)->exists();
    }

    /**
     * Return a standardized Pterodactyl + Addon compatible JSON error response.
     */
    public function blockedResponse(string $message, int $status = 403): JsonResponse
    {
        return response()->json([
            'demo_blocked' => true,
            'error' => $message,
            'message' => $message,
            'errors' => [
                [
                    'code' => 'DemoModeException',
                    'status' => (string) $status,
                    'detail' => $message,
                ],
            ],
        ], $status);
    }

    /**
     * Simulated offline resources payload matching StatsTransformer output.
     */
    public function getResourcesPayload(Server $server): array
    {
        return [
            'object' => 'stats',
            'attributes' => [
                'current_state' => 'offline',
                'is_suspended' => false,
                'resources' => [
                    'memory_bytes' => 0,
                    'cpu_absolute' => 0,
                    'disk_bytes' => self::DEMO_DISK_BYTES,
                    'network_rx_bytes' => 0,
                    'network_tx_bytes' => 0,
                    'uptime' => 0,
                ],
            ],
        ];
    }

    /**
     * Simulated websocket descriptor handled by the frontend demo socket shim.
     */
    public function getWebsocketPayload(): array
    {
        return [
            'data' => [
                'token' => 'demo-preview-token',
                'socket' => 'demo://offline',
            ],
        ];
    }

    /**
     * Simulated directory listing matching FileObjectTransformer output.
     */
    public function getDirectoryListing(string $directory): array
    {
        $normalized = '/' . trim(str_replace('\\', '/', $directory), '/');
        if ($normalized !== '/') {
            $normalized = rtrim($normalized, '/');
        }

        $now = Carbon::now()->subHours(2)->toAtomString();
        $earlier = Carbon::now()->subDays(3)->toAtomString();

        $tree = [
            '/' => [
                $this->dirEntry('config', $earlier),
                $this->dirEntry('logs', $now),
                $this->dirEntry('mods', $earlier),
                $this->dirEntry('plugins', $now),
                $this->dirEntry('world', $now),
                $this->dirEntry('world_nether', $now),
                $this->dirEntry('world_the_end', $now),
                $this->fileEntry('.pterodactyl-software.json', 214, 'application/json', $earlier),
                $this->fileEntry('banned-players.json', 248, 'application/json', $earlier),
                $this->fileEntry('bukkit.yml', 1420, 'text/yaml', $earlier),
                $this->fileEntry('eula.txt', 162, 'text/plain', $earlier),
                $this->fileEntry('ops.json', 295, 'application/json', $earlier),
                $this->fileEntry('paper-global.yml', 3210, 'text/yaml', $earlier),
                $this->fileEntry('server-icon.png', 1842, 'image/png', $earlier),
                $this->fileEntry('server.jar', 48921640, 'application/java-archive', $earlier),
                $this->fileEntry('server.properties', 1284, 'text/plain', $now),
                $this->fileEntry('spigot.yml', 2840, 'text/yaml', $earlier),
                $this->fileEntry('usercache.json', 412, 'application/json', $now),
                $this->fileEntry('whitelist.json', 2, 'application/json', $earlier),
            ],
            '/plugins' => [
                $this->dirEntry('Essentials', $now),
                $this->dirEntry('LuckPerms', $now),
                $this->fileEntry('EssentialsX-2.20.1.jar', 3842100, 'application/java-archive', $earlier),
                $this->fileEntry('LuckPerms-Bukkit-5.4.131.jar', 1756200, 'application/java-archive', $earlier),
                $this->fileEntry('Vault.jar', 321400, 'application/java-archive', $earlier),
                $this->fileEntry('WorldEdit-Bukkit-7.3.6.jar', 5912400, 'application/java-archive', $earlier),
            ],
            '/plugins/Essentials' => [
                $this->fileEntry('config.yml', 18420, 'text/yaml', $earlier),
                $this->fileEntry('motd.txt', 240, 'text/plain', $earlier),
            ],
            '/plugins/LuckPerms' => [
                $this->fileEntry('config.yml', 9410, 'text/yaml', $earlier),
            ],
            '/mods' => [
                $this->fileEntry('ferritecore-7.0.0-fabric.jar', 184320, 'application/java-archive', $earlier),
                $this->fileEntry('lithium-fabric-mc1.21.1.jar', 694120, 'application/java-archive', $earlier),
            ],
            '/logs' => [
                $this->fileEntry('latest.log', 4280, 'text/plain', $now),
            ],
            '/config' => [
                $this->fileEntry('paper-world-defaults.yml', 4120, 'text/yaml', $earlier),
            ],
            '/world' => [
                $this->dirEntry('datapacks', $earlier),
                $this->dirEntry('playerdata', $now),
                $this->dirEntry('region', $now),
                $this->dirEntry('stats', $now),
                $this->fileEntry('level.dat', 49152, 'application/octet-stream', $now),
                $this->fileEntry('session.lock', 3, 'application/octet-stream', $now),
                $this->fileEntry('uid.dat', 16, 'application/octet-stream', $earlier),
            ],
            '/world/datapacks' => [],
            '/world/playerdata' => [
                $this->fileEntry('069a79f4-44e9-4726-a5be-fca90e38aaf5.dat', 14200, 'application/octet-stream', $now),
                $this->fileEntry('45f50155-c09f-4fd8-b5b9-30d49100e4f2.dat', 11850, 'application/octet-stream', $now),
            ],
            '/world/region' => [
                $this->fileEntry('r.0.0.mca', 6421504, 'application/octet-stream', $now),
                $this->fileEntry('r.-1.0.mca', 4812800, 'application/octet-stream', $now),
            ],
            '/world/stats' => [
                $this->fileEntry('069a79f4-44e9-4726-a5be-fca90e38aaf5.json', 3840, 'application/json', $now),
            ],
            '/world_nether' => [
                $this->dirEntry('DIM-1', $now),
                $this->fileEntry('level.dat', 28410, 'application/octet-stream', $now),
            ],
            '/world_nether/DIM-1' => [
                $this->dirEntry('region', $now),
            ],
            '/world_the_end' => [
                $this->dirEntry('DIM1', $now),
                $this->fileEntry('level.dat', 24120, 'application/octet-stream', $now),
            ],
            '/world_the_end/DIM1' => [
                $this->dirEntry('region', $now),
            ],
        ];

        return [
            'object' => 'list',
            'data' => $tree[$normalized] ?? [],
        ];
    }

    /**
     * Simulated text file contents for File Manager editor preview.
     */
    public function getFileContents(Server $server, string $filePath): ?string
    {
        $clean = '/' . ltrim(str_replace('\\', '/', $filePath), '/');

        $props = $this->getDemoProperties($server);
        $propsText = "#Minecraft server properties (Demo Preview)\n";
        foreach ($props as $k => $v) {
            $propsText .= "{$k}={$v}\n";
        }

        $files = [
            '/server.properties' => $propsText,
            '/eula.txt' => "#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula=true\n",
            '/.pterodactyl-software.json' => json_encode([
                'software' => 'Paper',
                'software_id' => 'PAPER',
                'version' => '1.21.1',
                'build' => '#132',
                'filename' => 'server.jar',
                'source' => 'mcjars',
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n",
            '/ops.json' => json_encode([
                ['uuid' => '069a79f4-44e9-4726-a5be-fca90e38aaf5', 'name' => 'Notch', 'level' => 4, 'bypassesPlayerLimit' => true],
            ], JSON_PRETTY_PRINT) . "\n",
            '/whitelist.json' => "[]\n",
            '/banned-players.json' => json_encode([
                [
                    'uuid' => 'f84c6a79-0a4e-45e0-879b-cd49ebd4c4e2',
                    'name' => 'Herobrine',
                    'created' => '2026-11-10 18:45:00 +0000',
                    'source' => 'Console',
                    'expires' => 'forever',
                    'reason' => 'Griefing spawn area (Demo Sample)',
                ],
            ], JSON_PRETTY_PRINT) . "\n",
            '/usercache.json' => json_encode([
                ['name' => 'Notch', 'uuid' => '069a79f4-44e9-4726-a5be-fca90e38aaf5', 'expiresOn' => '2026-12-30 12:00:00 +0000'],
                ['name' => 'jeb_', 'uuid' => '853c80ef-3c37-49fd-aa49-938b674adae6', 'expiresOn' => '2026-12-30 12:00:00 +0000'],
                ['name' => 'Dinnerbone', 'uuid' => '61699b2e-d327-4a01-9f1e-0ea8c3f06bc6', 'expiresOn' => '2026-12-30 12:00:00 +0000'],
            ], JSON_PRETTY_PRINT) . "\n",
            '/bukkit.yml' => "settings:\n  allow-end: true\n  warn-on-overload: true\n  permissions-file: permissions.yml\n  connection-throttle: 4000\nspawn-limits:\n  monsters: 70\n  animals: 10\n  water-animals: 5\n",
            '/spigot.yml' => "settings:\n  save-user-cache-on-stop-only: false\n  bungeecord: false\n  sample-count: 12\nworld-settings:\n  default:\n    view-distance: default\n    entity-activation-range:\n      animals: 32\n      monsters: 32\n",
            '/paper-global.yml' => "chunk-loading-basic:\n  player-max-chunk-generate-rate: -1.0\n  player-max-chunk-load-rate: 100.0\ntimings:\n  enabled: false\n",
            '/config/paper-world-defaults.yml' => "entities:\n  spawning:\n    per-player-mob-spawns: true\nchunks:\n  auto-save-interval: default\n",
            '/plugins/Essentials/config.yml' => "# EssentialsX Demo Configuration\nops-name-color: '4'\nnickname-prefix: '~'\nmax-nick-length: 15\ntp-cooldown: 3\nhome-limits:\n  default: 3\n  vip: 10\n",
            '/plugins/Essentials/motd.txt' => "&6Welcome, {PLAYER}&6!\n&7Type &e/help &7for a list of commands.\n",
            '/plugins/LuckPerms/config.yml' => "server: survival-demo\nstorage-method: h2\nsync-minutes: 3\n",
            '/logs/latest.log' => "[14:22:01] [Server thread/INFO]: Starting minecraft server version 1.21.1\n"
                . "[14:22:01] [Server thread/INFO]: Loading properties\n"
                . "[14:22:02] [Server thread/INFO]: Default game type: SURVIVAL\n"
                . "[14:22:03] [Server thread/INFO]: [LuckPerms] Loading server plugin LuckPerms v5.4.131\n"
                . "[14:22:03] [Server thread/INFO]: [Vault] Loading server plugin Vault v1.7.3\n"
                . "[14:22:03] [Server thread/INFO]: [Essentials] Loading server plugin Essentials v2.20.1\n"
                . "[14:22:03] [Server thread/INFO]: [WorldEdit] Loading server plugin WorldEdit v7.3.6\n"
                . "[14:22:04] [Server thread/INFO]: Preparing level \"world\"\n"
                . "[14:22:05] [Server thread/INFO]: Done (4.128s)! For help, type \"help\"\n"
                . "[14:25:10] [Server thread/INFO]: Stopping server (Demo Preview Snapshot)\n",
        ];

        return $files[$clean] ?? null;
    }

    /**
     * Installed plugins payload matching PluginInstallerController::installed().
     */
    public function getInstalledPlugins(): array
    {
        $ts = Carbon::now()->subDays(2)->toAtomString();

        return [
            [
                'name' => 'EssentialsX-2.20.1.jar',
                'size' => 3842100,
                'modified_at' => $ts,
                'icon_url' => 'https://cdn.modrinth.com/data/hXi0b2oS/4f5b44903f444c2e13c436270e97274cf37c5377.png',
                'title' => 'EssentialsX',
                'plugin_id' => 'hXi0b2oS',
                'slug' => 'essentialsx',
                'provider' => 'modrinth',
            ],
            [
                'name' => 'LuckPerms-Bukkit-5.4.131.jar',
                'size' => 1756200,
                'modified_at' => $ts,
                'icon_url' => 'https://cdn.modrinth.com/data/Vebnzrzj/icon.png',
                'title' => 'LuckPerms',
                'plugin_id' => 'Vebnzrzj',
                'slug' => 'luckperms',
                'provider' => 'modrinth',
            ],
            [
                'name' => 'Vault.jar',
                'size' => 321400,
                'modified_at' => $ts,
                'icon_url' => null,
                'title' => 'Vault',
                'plugin_id' => null,
                'slug' => 'vault',
                'provider' => 'spigotmc',
            ],
            [
                'name' => 'WorldEdit-Bukkit-7.3.6.jar',
                'size' => 5912400,
                'modified_at' => $ts,
                'icon_url' => 'https://cdn.modrinth.com/data/1u6JkXh5/icon.png',
                'title' => 'WorldEdit',
                'plugin_id' => '1u6JkXh5',
                'slug' => 'worldedit',
                'provider' => 'modrinth',
            ],
        ];
    }

    /**
     * Installed mods payload matching ModInstallerController::installed().
     */
    public function getInstalledMods(): array
    {
        $ts = Carbon::now()->subDays(2)->toAtomString();

        return [
            [
                'name' => 'lithium-fabric-mc1.21.1.jar',
                'size' => 694120,
                'modified_at' => $ts,
                'icon_url' => 'https://cdn.modrinth.com/data/gvQqBUqZ/icon.png',
            ],
            [
                'name' => 'ferritecore-7.0.0-fabric.jar',
                'size' => 184320,
                'modified_at' => $ts,
                'icon_url' => 'https://cdn.modrinth.com/data/uXXizFIs/icon.png',
            ],
        ];
    }

    /**
     * Installed modpack payload matching ModpackInstallerController::installed().
     */
    public function getInstalledModpack(): array
    {
        return [
            'has_modpack' => false,
            'manifest' => null,
        ];
    }

    /**
     * Current software payload matching SoftwareInstallerController::current().
     */
    public function getCurrentSoftware(): array
    {
        return [
            'success' => true,
            'current' => [
                'software' => 'Paper',
                'software_id' => 'PAPER',
                'version' => '1.21.1',
                'build' => '#132',
                'filename' => 'server.jar',
                'source' => 'mcjars',
            ],
        ];
    }

    /**
     * Server Options & Properties payload matching OptionsController::index().
     */
    public function getServerOptions(Server $server): array
    {
        [$address, $port] = $this->resolveDemoAddress($server);
        $defaultIcon = 'data:image/png;base64,' . OptionsController::DEFAULT_ICON_BASE64;

        $expireAt = null;
        if (!empty($server->expire_at)) {
            $expireAt = is_string($server->expire_at)
                ? $server->expire_at
                : $server->expire_at->toIso8601String();
        }

        return [
            'success' => true,
            'is_demo' => true,
            'software' => [
                'id' => 'PAPER',
                'name' => 'Paper',
                'category' => 'java',
                'version' => '1.21.1',
                'build' => '#132',
                'supports_plugins' => true,
                'supports_mods' => false,
                'config_file' => '/server.properties',
            ],
            'address' => $address,
            'port' => $port,
            'server_name' => $server->name,
            'server_description' => $server->description ?? '',
            'has_custom_icon' => false,
            'icon_data' => $defaultIcon,
            'default_icon' => $defaultIcon,
            'default_motd' => OptionsController::DEFAULT_MOTD,
            'file_exists' => true,
            'properties' => $this->getDemoProperties($server),
            'expire_at' => $expireAt,
            'is_suspended' => false,
            'plan_name' => $server->plan_name ?? 'Diamond 8GB Demo',
            'plan_price' => $server->plan_price ?? '$9.99/mo',
            'can_edit' => false,
        ];
    }

    /**
     * Player Manager index payload matching PlayerManagerController::index().
     */
    public function getPlayersIndex(Server $server): array
    {
        $players = $this->demoPlayersCatalog();

        $allPlayers = [];
        $bannedPlayers = [];

        foreach ($players as $p) {
            $encoded = urlencode($p['name']);
            $entry = [
                'name' => $p['name'],
                'uuid' => $p['uuid'],
                'expires_on' => '2026-12-30 12:00:00 +0000',
                'is_op' => $p['is_op'],
                'is_banned' => $p['is_banned'],
                'is_online' => false,
                'skin_url' => "https://mc-heads.net/skin/{$encoded}",
                'avatar_url' => "https://mc-heads.net/avatar/{$encoded}/64",
                'render_3d_url' => "https://visage.surgeplay.com/full/512/{$encoded}",
                'skin_type' => 'premium',
                'skin_name' => $p['name'],
                'is_cracked' => false,
            ];

            $allPlayers[] = $entry;

            if ($p['is_banned']) {
                $bannedPlayers[] = array_merge($entry, [
                    'created' => '2026-11-10 18:45:00 +0000',
                    'source' => 'Console',
                    'expires' => 'forever',
                    'reason' => $p['ban_reason'],
                ]);
            }
        }

        return [
            'success' => true,
            'is_demo' => true,
            'software' => [
                'id' => 'PAPER',
                'name' => 'Paper',
                'category' => 'java',
                'version' => '1.21.1',
                'build' => '#132',
                'supports_plugins' => true,
                'supports_mods' => false,
            ],
            'server_online' => false,
            'online_count' => 0,
            'max_players' => 50,
            'online_mode' => true,
            'online_players' => [],
            'banned_players' => $bannedPlayers,
            'banned_ips' => [],
            'all_players' => $allPlayers,
        ];
    }

    /**
     * Player Manager detail payload matching PlayerManagerController::detail().
     */
    public function getPlayerDetail(string $playerName, string $playerUuid): array
    {
        $catalog = $this->demoPlayersCatalog();
        $selected = $catalog[0];

        foreach ($catalog as $candidate) {
            if (
                ($playerName !== '' && strcasecmp($candidate['name'], $playerName) === 0) ||
                ($playerUuid !== '' && strcasecmp($candidate['uuid'], $playerUuid) === 0)
            ) {
                $selected = $candidate;
                break;
            }
        }

        $encoded = urlencode($selected['name']);

        return [
            'success' => true,
            'is_demo' => true,
            'software' => [
                'id' => 'PAPER',
                'name' => 'Paper',
                'category' => 'java',
                'version' => '1.21.1',
                'build' => '#132',
                'supports_plugins' => true,
                'supports_mods' => false,
            ],
            'name' => $selected['name'],
            'uuid' => $selected['uuid'],
            'is_op' => $selected['is_op'],
            'is_banned' => $selected['is_banned'],
            'is_whitelisted' => true,
            'ban_info' => $selected['is_banned'] ? [
                'created' => '2026-11-10 18:45:00 +0000',
                'source' => 'Console',
                'expires' => 'forever',
                'reason' => $selected['ban_reason'],
            ] : null,
            'skin_url' => "https://mc-heads.net/skin/{$encoded}",
            'avatar_url' => "https://mc-heads.net/avatar/{$encoded}/64",
            'render_3d_url' => "https://visage.surgeplay.com/full/512/{$encoded}",
            'skin_type' => 'premium',
            'skin_name' => $selected['name'],
            'is_cracked' => false,
            'inventory' => [
                [
                    'slot' => 103,
                    'id' => 'minecraft:netherite_helmet',
                    'clean_id' => 'netherite_helmet',
                    'count' => 1,
                    'name' => 'Netherite Helmet',
                    'damage' => 12,
                    'enchantments' => [
                        ['id' => 'protection', 'lvl' => 4],
                        ['id' => 'unbreaking', 'lvl' => 3],
                        ['id' => 'mending', 'lvl' => 1],
                    ],
                ],
                [
                    'slot' => 102,
                    'id' => 'minecraft:netherite_chestplate',
                    'clean_id' => 'netherite_chestplate',
                    'count' => 1,
                    'name' => 'Netherite Chestplate',
                    'damage' => 24,
                    'enchantments' => [
                        ['id' => 'protection', 'lvl' => 4],
                        ['id' => 'unbreaking', 'lvl' => 3],
                    ],
                ],
                [
                    'slot' => 101,
                    'id' => 'minecraft:netherite_leggings',
                    'clean_id' => 'netherite_leggings',
                    'count' => 1,
                    'name' => 'Netherite Leggings',
                    'damage' => 15,
                    'enchantments' => [
                        ['id' => 'protection', 'lvl' => 4],
                    ],
                ],
                [
                    'slot' => 100,
                    'id' => 'minecraft:netherite_boots',
                    'clean_id' => 'netherite_boots',
                    'count' => 1,
                    'name' => 'Netherite Boots',
                    'damage' => 8,
                    'enchantments' => [
                        ['id' => 'feather_falling', 'lvl' => 4],
                        ['id' => 'depth_strider', 'lvl' => 3],
                    ],
                ],
                [
                    'slot' => -106,
                    'id' => 'minecraft:totem_of_undying',
                    'clean_id' => 'totem_of_undying',
                    'count' => 1,
                    'name' => 'Totem of Undying',
                ],
                [
                    'slot' => 0,
                    'id' => 'minecraft:netherite_sword',
                    'clean_id' => 'netherite_sword',
                    'count' => 1,
                    'name' => 'Netherite Sword',
                    'damage' => 19,
                    'enchantments' => [
                        ['id' => 'sharpness', 'lvl' => 5],
                        ['id' => 'looting', 'lvl' => 3],
                        ['id' => 'unbreaking', 'lvl' => 3],
                    ],
                    'lore' => ['Demo Showcase Blade'],
                ],
                [
                    'slot' => 1,
                    'id' => 'minecraft:netherite_pickaxe',
                    'clean_id' => 'netherite_pickaxe',
                    'count' => 1,
                    'name' => 'Netherite Pickaxe',
                    'damage' => 42,
                    'enchantments' => [
                        ['id' => 'efficiency', 'lvl' => 5],
                        ['id' => 'fortune', 'lvl' => 3],
                        ['id' => 'mending', 'lvl' => 1],
                    ],
                ],
                [
                    'slot' => 2,
                    'id' => 'minecraft:bow',
                    'clean_id' => 'bow',
                    'count' => 1,
                    'name' => 'Bow',
                    'enchantments' => [
                        ['id' => 'power', 'lvl' => 5],
                        ['id' => 'infinity', 'lvl' => 1],
                    ],
                ],
                [
                    'slot' => 3,
                    'id' => 'minecraft:golden_apple',
                    'clean_id' => 'golden_apple',
                    'count' => 16,
                    'name' => 'Golden Apple',
                ],
                [
                    'slot' => 4,
                    'id' => 'minecraft:ender_pearl',
                    'clean_id' => 'ender_pearl',
                    'count' => 16,
                    'name' => 'Ender Pearl',
                ],
                [
                    'slot' => 8,
                    'id' => 'minecraft:cooked_beef',
                    'clean_id' => 'cooked_beef',
                    'count' => 64,
                    'name' => 'Steak',
                ],
                [
                    'slot' => 9,
                    'id' => 'minecraft:diamond',
                    'clean_id' => 'diamond',
                    'count' => 32,
                    'name' => 'Diamond',
                ],
                [
                    'slot' => 10,
                    'id' => 'minecraft:elytra',
                    'clean_id' => 'elytra',
                    'count' => 1,
                    'name' => 'Elytra',
                    'enchantments' => [
                        ['id' => 'unbreaking', 'lvl' => 3],
                        ['id' => 'mending', 'lvl' => 1],
                    ],
                ],
                [
                    'slot' => 11,
                    'id' => 'minecraft:firework_rocket',
                    'clean_id' => 'firework_rocket',
                    'count' => 64,
                    'name' => 'Firework Rocket',
                ],
            ],
            'ender_chest' => [
                [
                    'slot' => 0,
                    'id' => 'minecraft:enchanted_golden_apple',
                    'clean_id' => 'enchanted_golden_apple',
                    'count' => 4,
                    'name' => 'Enchanted Golden Apple',
                ],
                [
                    'slot' => 1,
                    'id' => 'minecraft:shulker_box',
                    'clean_id' => 'shulker_box',
                    'count' => 1,
                    'name' => 'Shulker Box',
                ],
                [
                    'slot' => 2,
                    'id' => 'minecraft:netherite_ingot',
                    'clean_id' => 'netherite_ingot',
                    'count' => 12,
                    'name' => 'Netherite Ingot',
                ],
            ],
            'stats' => [
                'health' => 20.0,
                'food_level' => 20,
                'level' => $selected['level'],
                'exp' => 0.65,
                'game_mode' => 0,
                'dimension' => 'minecraft:overworld',
                'pos' => [128, 72, -245],
                'last_death_location' => null,
                'last_modified' => Carbon::now()->subHours(3)->toAtomString(),
            ],
            'game_statistics' => [
                'play_time_seconds' => 154800,
                'play_time_formatted' => '43h 0m',
                'player_kills' => 14,
                'deaths' => 3,
                'mob_kills' => 842,
                'kdr' => '4.67',
                'distance_travelled' => [
                    'walked' => 142500,
                    'sprinted' => 98400,
                    'crouched' => 8120,
                    'fallen' => 3410,
                    'climbed' => 1240,
                    'walked_under_water' => 2950,
                    'walked_on_water' => 4180,
                ],
                'blocks_broken' => [
                    ['id' => 'minecraft:stone', 'clean_id' => 'stone', 'name' => 'Stone', 'count' => 18420],
                    ['id' => 'minecraft:deepslate', 'clean_id' => 'deepslate', 'name' => 'Deepslate', 'count' => 9210],
                    ['id' => 'minecraft:diamond_ore', 'clean_id' => 'diamond_ore', 'name' => 'Diamond Ore', 'count' => 164],
                ],
                'items_used' => [
                    ['id' => 'minecraft:netherite_pickaxe', 'clean_id' => 'netherite_pickaxe', 'name' => 'Netherite Pickaxe', 'count' => 28100],
                    ['id' => 'minecraft:firework_rocket', 'clean_id' => 'firework_rocket', 'name' => 'Firework Rocket', 'count' => 1420],
                ],
                'entities_killed' => [
                    ['id' => 'minecraft:zombie', 'clean_id' => 'zombie', 'name' => 'Zombie', 'count' => 310],
                    ['id' => 'minecraft:skeleton', 'clean_id' => 'skeleton', 'name' => 'Skeleton', 'count' => 245],
                    ['id' => 'minecraft:creeper', 'clean_id' => 'creeper', 'name' => 'Creeper', 'count' => 128],
                ],
            ],
        ];
    }

    /**
     * World Manager index payload matching WorldManagerController::index().
     */
    public function getWorldsIndex(Server $server): array
    {
        $ts = Carbon::now()->subHours(2)->toAtomString();

        return [
            'active_world' => 'world',
            'seed' => '-4281957392014',
            'difficulty' => 'normal',
            'gamemode' => 'survival',
            'hardcore' => false,
            'worlds' => [
                [
                    'name' => 'world',
                    'display_name' => 'world',
                    'is_active' => true,
                    'is_dimension' => false,
                    'parent_world' => null,
                    'folder_path' => 'world',
                    'size' => 503316480,
                    'modified_at' => $ts,
                    'has_level_dat' => true,
                    'has_overworld' => true,
                    'has_nether' => true,
                    'has_end' => true,
                    'optimized' => true,
                    'force_upgrade' => false,
                ],
                [
                    'name' => 'world_nether',
                    'display_name' => 'world_nether',
                    'is_active' => true,
                    'is_dimension' => true,
                    'dimension_type' => 'nether',
                    'parent_world' => 'world',
                    'folder_path' => 'world_nether',
                    'size' => 117440512,
                    'modified_at' => $ts,
                    'has_level_dat' => true,
                    'has_overworld' => false,
                    'has_nether' => true,
                    'has_end' => false,
                    'optimized' => false,
                    'force_upgrade' => false,
                ],
                [
                    'name' => 'world_the_end',
                    'display_name' => 'world_the_end',
                    'is_active' => true,
                    'is_dimension' => true,
                    'dimension_type' => 'the_end',
                    'parent_world' => 'world',
                    'folder_path' => 'world_the_end',
                    'size' => 88080384,
                    'modified_at' => $ts,
                    'has_level_dat' => true,
                    'has_overworld' => false,
                    'has_nether' => false,
                    'has_end' => true,
                    'optimized' => false,
                    'force_upgrade' => false,
                ],
                [
                    'name' => 'lobby',
                    'display_name' => 'lobby',
                    'is_active' => false,
                    'is_dimension' => false,
                    'parent_world' => null,
                    'folder_path' => 'lobby',
                    'size' => 99614720,
                    'modified_at' => Carbon::now()->subDays(5)->toAtomString(),
                    'has_level_dat' => true,
                    'has_overworld' => true,
                    'has_nether' => false,
                    'has_end' => false,
                    'optimized' => false,
                    'force_upgrade' => false,
                ],
            ],
        ];
    }

    /**
     * World Manager options payload matching WorldManagerController::options().
     */
    public function getWorldOptions(string $worldName): array
    {
        $cleanWorld = trim($worldName) !== '' ? trim($worldName) : 'world';

        return [
            'world' => $cleanWorld,
            'seed' => '-4281957392014',
            'hardcore' => false,
            'difficulty' => 'normal',
            'enabled_features' => ['vanilla'],
            'enabled_datapacks' => ['vanilla'],
            'disabled_datapacks' => [],
            'gamerules' => [
                'keep_inventory' => false,
                'mob_griefing' => true,
                'pvp' => true,
                'spawn_monsters' => true,
                'spawn_mobs' => true,
                'tnt_explodes' => true,
                'fall_damage' => true,
                'fire_damage' => true,
                'drowning_damage' => true,
                'freeze_damage' => true,
                'show_death_messages' => true,
                'show_advancement_messages' => true,
                'advance_weather' => true,
                'raids' => true,
                'spawn_phantoms' => true,
                'spawn_patrols' => true,
                'spawn_wandering_traders' => true,
                'immediate_respawn' => false,
                'reduced_debug_info' => false,
                'command_block_output' => true,
                'send_command_feedback' => true,
                'players_sleeping_percentage' => 100,
                'random_tick_speed' => 3,
                'respawn_radius' => 10,
                'max_entity_cramming' => 24,
            ],
        ];
    }

    /**
     * AI Assistant info payload matching AiAssistantController::info().
     */
    public function getAiInfo(Server $server): array
    {
        [$address, $port] = $this->resolveDemoAddress($server);
        $host = explode(':', $address)[0] ?: 'play.demo-server.net';

        return [
            'success' => true,
            'server' => [
                'name' => $server->name,
                'uuid' => $server->uuid,
                'status' => 'offline',
                'memory_limit' => $server->memory,
                'disk_limit' => $server->disk,
                'cpu_limit' => $server->cpu,
            ],
            'allocations' => [
                [
                    'ip' => $host,
                    'port' => $port,
                    'is_default' => true,
                ],
            ],
            'plugins_count' => 4,
            'plugins' => ['EssentialsX-2.20.1.jar', 'LuckPerms-Bukkit-5.4.131.jar', 'Vault.jar', 'WorldEdit-Bukkit-7.3.6.jar'],
            'ai' => [
                'provider' => 'Demo Preview Mode',
                'model' => 'llama-3.3-70b-versatile',
                'active' => true,
            ],
        ];
    }

    /**
     * Simulated AI crash diagnoser response without calling external LLM APIs or Wings.
     */
    public function getAiDiagnose(): array
    {
        return [
            'success' => true,
            'diagnosis' => [
                'has_error' => false,
                'issue_title' => 'No Errors Detected (Demo Preview)',
                'cause' => 'Paper 1.21.1 and all 4 sample plugins loaded cleanly in the preview log snapshot.',
                'solution' => 'Everything looks healthy! On a live server, AI Auto-Fix automatically detects EULA prompts, port conflicts, corrupted JARs, and world locks.',
                'auto_fixable' => false,
                'action_type' => 'none',
                'action_params' => [],
                'requires_restart' => false,
            ],
            'source_file' => '/logs/latest.log',
            'log_snippet' => "[14:22:01] [Server thread/INFO]: Starting minecraft server version 1.21.1\n[14:22:03] [Server thread/INFO]: [Essentials] Loading server plugin Essentials v2.20.1\n[14:22:05] [Server thread/INFO]: Done (4.128s)! For help, type \"help\"",
        ];
    }

    /**
     * Simulated AI assistant chat reply without consuming external API quota or mutating server files.
     */
    public function getAiChat(string $message): array
    {
        $clean = trim($message);

        return [
            'success' => true,
            'thought' => 'Demo Preview Mode — simulating AI Co-Pilot response without mutating server files.',
            'message' => "I'm running in **Demo Preview Mode** for this dummy server"
                . ($clean !== '' ? " (received: \"{$clean}\")" : '')
                . ".\n\nOn a live customer server, I can automatically:\n"
                . "- Install & configure plugins, mods, modpacks, and server software\n"
                . "- Set up Geyser/Floodgate Bedrock crossplay & Simple Voice Chat UDP ports\n"
                . "- Diagnose crash logs and auto-repair broken configs\n"
                . "- Optimize `server.properties` and Paper configs\n\n"
                . '*Note: Server mutations and power start actions are disabled in this demo account.*',
            'action' => 'none',
            'action_params' => [],
        ];
    }

    /**
     * Resolve demo server address & port from allocation or sensible default.
     *
     * @return array{0: string, 1: int}
     */
    private function resolveDemoAddress(Server $server): array
    {
        $allocation = $server->allocation;
        if ($allocation) {
            $host = !empty($allocation->ip_alias) ? $allocation->ip_alias : $allocation->ip;
            $port = (int) $allocation->port;
            return ["{$host}:{$port}", $port];
        }

        return [self::DEMO_DEFAULT_ALLOCATION, 25565];
    }

    private function getDemoProperties(Server $server): array
    {
        [, $port] = $this->resolveDemoAddress($server);

        return [
            'motd' => OptionsController::DEFAULT_MOTD,
            'server-port' => (string) $port,
            'max-players' => '50',
            'gamemode' => 'survival',
            'difficulty' => 'normal',
            'hardcore' => 'false',
            'force-gamemode' => 'false',
            'online-mode' => 'true',
            'white-list' => 'false',
            'enforce-whitelist' => 'false',
            'prevent-proxy-connections' => 'false',
            'pvp' => 'true',
            'allow-flight' => 'false',
            'enable-command-block' => 'true',
            'allow-nether' => 'true',
            'spawn-protection' => '16',
            'spawn-monsters' => 'true',
            'spawn-animals' => 'true',
            'spawn-npcs' => 'true',
            'view-distance' => '10',
            'simulation-distance' => '8',
            'level-name' => 'world',
            'level-seed' => '-4281957392014',
            'require-resource-pack' => 'false',
        ];
    }

    private function demoPlayersCatalog(): array
    {
        return [
            [
                'name' => 'Notch',
                'uuid' => '069a79f4-44e9-4726-a5be-fca90e38aaf5',
                'is_op' => true,
                'is_banned' => false,
                'ban_reason' => '',
                'level' => 42,
            ],
            [
                'name' => 'jeb_',
                'uuid' => '853c80ef-3c37-49fd-aa49-938b674adae6',
                'is_op' => false,
                'is_banned' => false,
                'ban_reason' => '',
                'level' => 28,
            ],
            [
                'name' => 'Dinnerbone',
                'uuid' => '61699b2e-d327-4a01-9f1e-0ea8c3f06bc6',
                'is_op' => false,
                'is_banned' => false,
                'ban_reason' => '',
                'level' => 19,
            ],
            [
                'name' => 'Herobrine',
                'uuid' => 'f84c6a79-0a4e-45e0-879b-cd49ebd4c4e2',
                'is_op' => false,
                'is_banned' => true,
                'ban_reason' => 'Griefing spawn area (Demo Sample)',
                'level' => 7,
            ],
        ];
    }

    private function dirEntry(string $name, string $timestamp): array
    {
        return [
            'object' => 'file_object',
            'attributes' => [
                'name' => $name,
                'mode' => 'drwxr-xr-x',
                'mode_bits' => '755',
                'size' => 4096,
                'is_file' => false,
                'is_symlink' => false,
                'mimetype' => 'inode/directory',
                'created_at' => $timestamp,
                'modified_at' => $timestamp,
            ],
        ];
    }

    private function fileEntry(string $name, int $size, string $mime, string $timestamp): array
    {
        return [
            'object' => 'file_object',
            'attributes' => [
                'name' => $name,
                'mode' => '-rw-r--r--',
                'mode_bits' => '644',
                'size' => $size,
                'is_file' => true,
                'is_symlink' => false,
                'mimetype' => $mime,
                'created_at' => $timestamp,
                'modified_at' => $timestamp,
            ],
        ];
    }

    private function hasColumn(string $table, string $column): bool
    {
        static $cache = [];
        $key = "{$table}.{$column}";
        if (!array_key_exists($key, $cache)) {
            try {
                $cache[$key] = Schema::hasColumn($table, $column);
            } catch (\Throwable $e) {
                $cache[$key] = false;
            }
        }
        return $cache[$key];
    }
}
