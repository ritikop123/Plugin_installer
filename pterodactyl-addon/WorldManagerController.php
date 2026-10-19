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

if (!function_exists('str_starts_with')) {
    function str_starts_with(?string $haystack, ?string $needle): bool {
        return $needle === '' || ($haystack !== null && strpos($haystack, $needle) === 0);
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(?string $haystack, ?string $needle): bool {
        return $needle === '' || ($haystack !== null && substr($haystack, -strlen($needle)) === $needle);
    }
}
if (!function_exists('str_contains')) {
    function str_contains(?string $haystack, ?string $needle): bool {
        return $needle === '' || ($haystack !== null && strpos($haystack, $needle) !== false);
    }
}

class WorldManagerController extends ClientApiController
{
    protected DaemonFileRepository $fileRepository;
    protected ?DaemonCommandRepository $commandRepository;

    public function __construct(
        DaemonFileRepository $fileRepository,
        DaemonCommandRepository $commandRepository = null
    ) {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->commandRepository = $commandRepository;
    }

    /**
     * List all detected Minecraft worlds, active level-name, seeds, and optimization states.
     * GET /api/client/servers/{server}/worlds
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $properties = $this->getServerProperties($server);
            $activeWorld = !empty($properties['level-name']) ? trim((string) $properties['level-name']) : 'world';
            $seed = !empty($properties['level-seed']) ? trim((string) $properties['level-seed']) : '';
            $difficulty = !empty($properties['difficulty']) ? trim((string) $properties['difficulty']) : 'easy';
            $gamemode = !empty($properties['gamemode']) ? trim((string) $properties['gamemode']) : 'survival';
            $hardcore = !empty($properties['hardcore']) && ($properties['hardcore'] === 'true' || $properties['hardcore'] === '1');

            $worldSettings = $this->getWorldSettings($server);

            $rootItems = [];
            try {
                $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
            } catch (Throwable $e) {}

            $rootFoldersMap = [];
            if (is_array($rootItems)) {
                foreach ($rootItems as $item) {
                    $name = $item['name'] ?? '';
                    $isDir = !empty($item['directory']) || !empty($item['is_directory']) || empty($item['file']);
                    if ($isDir && !empty($name) && $name !== '.' && $name !== '..' && !str_starts_with($name, '.')) {
                        $rootFoldersMap[strtolower($name)] = $item;
                    }
                }
            }

            // Quick single check into active world directory to detect internal dimensions
            $hasDimMinus1 = false;
            $hasDim1 = false;
            $hasRegion = false;
            $hasLevelDat = false;

            if (isset($rootFoldersMap[strtolower($activeWorld)])) {
                try {
                    $activeSubItems = $this->fileRepository->setServer($server)->getDirectory('/' . $activeWorld);
                    if (is_array($activeSubItems)) {
                        foreach ($activeSubItems as $sub) {
                            $subName = strtolower($sub['name'] ?? '');
                            if ($subName === 'level.dat') $hasLevelDat = true;
                            if ($subName === 'region') $hasRegion = true;
                            if ($subName === 'dim-1' || $subName === 'nether') $hasDimMinus1 = true;
                            if ($subName === 'dim1' || $subName === 'the_end' || $subName === 'end') $hasDim1 = true;
                            if ($subName === 'dimensions') {
                                $hasDimMinus1 = true;
                                $hasDim1 = true;
                            }
                        }
                    }
                } catch (Throwable $e) {}
            }

            $worlds = [];
            $seenWorldNames = [];

            // 1. Primary Overworld
            $activeItem = $rootFoldersMap[strtolower($activeWorld)] ?? null;
            $activeCfg = $worldSettings[$activeWorld] ?? [];
            $worlds[] = [
                'name' => $activeWorld,
                'display_name' => $activeWorld,
                'is_active' => true,
                'is_dimension' => false,
                'dimension_type' => 'overworld',
                'parent_world' => $activeWorld,
                'folder_path' => $activeWorld,
                'size' => (int) ($activeItem['size'] ?? 0),
                'modified_at' => $activeItem['modified_at'] ?? $activeItem['modifiedAt'] ?? '',
                'has_level_dat' => $hasLevelDat,
                'has_overworld' => true,
                'has_nether' => true,
                'has_end' => true,
                'optimized' => !empty($activeCfg['optimized']),
                'force_upgrade' => !empty($activeCfg['force_upgrade']),
            ];
            $seenWorldNames[strtolower($activeWorld)] = true;

            // 2. Nether Dimension (Paper/Spigot separate folder OR Vanilla/Fabric DIM-1)
            $netherRootName = "{$activeWorld}_nether";
            $hasNetherRoot = isset($rootFoldersMap[strtolower($netherRootName)]);
            $netherItem = $hasNetherRoot ? $rootFoldersMap[strtolower($netherRootName)] : null;
            $netherCfg = $worldSettings[$netherRootName] ?? $activeCfg;

            $worlds[] = [
                'name' => $netherRootName,
                'display_name' => $netherRootName,
                'is_active' => true,
                'is_dimension' => true,
                'dimension_type' => 'nether',
                'parent_world' => $activeWorld,
                'folder_path' => $hasNetherRoot ? $netherRootName : "{$activeWorld}/DIM-1",
                'size' => (int) ($netherItem['size'] ?? 0),
                'modified_at' => $netherItem['modified_at'] ?? $netherItem['modifiedAt'] ?? '',
                'has_level_dat' => $hasNetherRoot,
                'has_overworld' => false,
                'has_nether' => true,
                'has_end' => false,
                'optimized' => !empty($netherCfg['optimized']),
                'force_upgrade' => false,
            ];
            $seenWorldNames[strtolower($netherRootName)] = true;

            // 3. The End Dimension (Paper/Spigot separate folder OR Vanilla/Fabric DIM1)
            $endRootName = "{$activeWorld}_the_end";
            $hasEndRoot = isset($rootFoldersMap[strtolower($endRootName)]);
            $endItem = $hasEndRoot ? $rootFoldersMap[strtolower($endRootName)] : null;
            $endCfg = $worldSettings[$endRootName] ?? $activeCfg;

            $worlds[] = [
                'name' => $endRootName,
                'display_name' => $endRootName,
                'is_active' => true,
                'is_dimension' => true,
                'dimension_type' => 'the_end',
                'parent_world' => $activeWorld,
                'folder_path' => $hasEndRoot ? $endRootName : "{$activeWorld}/DIM1",
                'size' => (int) ($endItem['size'] ?? 0),
                'modified_at' => $endItem['modified_at'] ?? $endItem['modifiedAt'] ?? '',
                'has_level_dat' => $hasEndRoot,
                'has_overworld' => false,
                'has_nether' => false,
                'has_end' => true,
                'optimized' => !empty($endCfg['optimized']),
                'force_upgrade' => false,
            ];
            $seenWorldNames[strtolower($endRootName)] = true;

            // 4. Secondary or auxiliary worlds in root directory
            $ignoredFolders = ['plugins', 'mods', 'config', 'defaultconfigs', 'logs', 'crash-reports', 'libraries', 'versions', 'cache', 'core', 'web', 'resourcepacks'];
            foreach ($rootFoldersMap as $lowerName => $item) {
                if (isset($seenWorldNames[$lowerName]) || in_array($lowerName, $ignoredFolders)) {
                    continue;
                }

                $origName = $item['name'] ?? '';
                $isNetherAux = str_ends_with($lowerName, '_nether');
                $isEndAux = str_ends_with($lowerName, '_the_end');
                $isWorldCandidate = $isNetherAux || $isEndAux || isset($worldSettings[$origName]);

                if (!$isWorldCandidate) {
                    try {
                        $checkSub = $this->fileRepository->setServer($server)->getDirectory('/' . $origName);
                        if (is_array($checkSub)) {
                            foreach ($checkSub as $cs) {
                                $csName = strtolower($cs['name'] ?? '');
                                if ($csName === 'level.dat' || $csName === 'region') {
                                    $isWorldCandidate = true;
                                    break;
                                }
                            }
                        }
                    } catch (Throwable $e) {}
                }

                if ($isWorldCandidate) {
                    $cfg = $worldSettings[$origName] ?? [];
                    $worlds[] = [
                        'name' => $origName,
                        'display_name' => $origName,
                        'is_active' => false,
                        'is_dimension' => ($isNetherAux || $isEndAux),
                        'dimension_type' => $isNetherAux ? 'nether' : ($isEndAux ? 'the_end' : 'overworld'),
                        'parent_world' => $isNetherAux ? str_replace('_nether', '', $origName) : ($isEndAux ? str_replace('_the_end', '', $origName) : $origName),
                        'folder_path' => $origName,
                        'size' => (int) ($item['size'] ?? 0),
                        'modified_at' => $item['modified_at'] ?? $item['modifiedAt'] ?? '',
                        'has_level_dat' => true,
                        'has_overworld' => !$isNetherAux && !$isEndAux,
                        'has_nether' => $isNetherAux,
                        'has_end' => $isEndAux,
                        'optimized' => !empty($cfg['optimized']),
                        'force_upgrade' => !empty($cfg['force_upgrade']),
                    ];
                    $seenWorldNames[$lowerName] = true;
                }
            }

            return response()->json([
                'active_world' => $activeWorld,
                'seed' => $seed,
                'difficulty' => $difficulty,
                'gamemode' => $gamemode,
                'hardcore' => $hardcore,
                'worlds' => $worlds,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to load world information: ' . $e->getMessage(),
                'active_world' => 'world',
                'worlds' => [],
            ], 500);
        }
    }

    /**
     * Get detailed options, gamerules, and datapacks for a world.
     * GET /api/client/servers/{server}/worlds/options
     */
    public function options(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $properties = $this->getServerProperties($server);
        $activeWorld = !empty($properties['level-name']) ? trim((string) $properties['level-name']) : 'world';
        $worldName = trim((string) $request->query('world', $activeWorld));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $worldName)) ?: $activeWorld;

        $seed = !empty($properties['level-seed']) ? trim((string) $properties['level-seed']) : '-409661327638046210';
        $difficulty = !empty($properties['difficulty']) ? trim((string) $properties['difficulty']) : 'easy';
        $hardcore = !empty($properties['hardcore']) && ($properties['hardcore'] === 'true' || $properties['hardcore'] === '1');

        // Load persisted gamerules from server-gamerules.json
        $savedGamerules = $this->getSavedGamerules($server);

        // Standard Default Minecraft Gamerules
        $defaultGamerules = [
            'spawn_wandering_traders' => true,
            'block_drops' => true,
            'reduced_debug_info' => false,
            'show_death_messages' => true,
            'spawn_monsters' => true,
            'spawner_blocks_work' => true,
            'tnt_explodes' => true,
            'immediate_respawn' => false,
            'player_movement_check' => true,
            'block_explosion_drop_decay' => true,
            'spread_vines' => true,
            'max_entity_cramming' => 24,
            'forgive_dead_players' => true,
            'fall_damage' => true,
            'send_command_feedback' => true,
            'global_sound_events' => true,
            'elytra_movement_check' => true,
            'fire_spread_radius_around_player' => 128,
            'freeze_damage' => true,
            'mob_explosion_drop_decay' => true,
            'mob_griefing' => true,
            'spawn_mobs' => true,
            'pvp' => true,
            'spectators_generate_chunks' => true,
            'players_sleeping_percentage' => 100,
            'max_command_sequence_length' => 65536,
            'players_nether_portal_creative_delay' => 0,
            'advance_weather' => true,
            'max_block_modifications' => 32768,
            'max_command_forks' => 65536,
            'drowning_damage' => true,
            'command_block_output' => true,
            'locator_bar' => true,
            'show_advancement_messages' => true,
            'respawn_radius' => 10,
            'raids' => true,
            'spawn_phantoms' => true,
            'max_snow_accumulation_height' => 1,
            'limited_crafting' => false,
            'allow_entering_nether_using_portals' => true,
            'lava_source_conversion' => false,
            'tnt_explosion_drop_decay' => false,
            'universal_anger' => false,
            'keep_inventory' => false,
            'spawn_patrols' => true,
            'random_tick_speed' => 3,
            'fire_damage' => true,
            'entity_drops' => true,
            'advance_time' => true,
            'command_blocks_work' => true,
            'spawn_wardens' => true,
            'water_source_conversion' => true,
            'projectiles_can_break_blocks' => true,
            'ender_pearls_vanish_on_death' => true,
        ];

        // Merge saved overrides
        $gamerules = array_merge($defaultGamerules, $savedGamerules);

        // Detect Datapacks
        $enabledDatapacks = ['Vanilla', 'file/bukkit', 'paper'];
        $disabledDatapacks = ['Minecart Improvements', 'Redstone Experiments', 'Trade Rebalance'];

        try {
            $datapacksDir = '/' . $cleanWorld . '/datapacks';
            $dpItems = $this->fileRepository->setServer($server)->getDirectory($datapacksDir);
            if (is_array($dpItems)) {
                foreach ($dpItems as $dp) {
                    $dpName = $dp['name'] ?? '';
                    if (!empty($dpName) && $dpName !== '.' && $dpName !== '..') {
                        $cleanDpName = str_replace('.zip', '', $dpName);
                        if (!in_array($cleanDpName, $enabledDatapacks)) {
                            $enabledDatapacks[] = $cleanDpName;
                        }
                    }
                }
            }
        } catch (Throwable $e) {}

        return response()->json([
            'world' => $cleanWorld,
            'seed' => $seed,
            'hardcore' => $hardcore,
            'difficulty' => $difficulty,
            'enabled_features' => ['Vanilla'],
            'enabled_datapacks' => $enabledDatapacks,
            'disabled_datapacks' => $disabledDatapacks,
            'gamerules' => $gamerules,
        ]);
    }

    /**
     * Update an individual gamerule.
     * POST /api/client/servers/{server}/worlds/gamerule
     */
    public function updateGamerule(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        $rule = trim((string) $request->input('rule', ''));
        $value = $request->input('value');
        $world = trim((string) $request->input('world', ''));

        if (empty($rule)) {
            return response()->json(['error' => 'Rule name is required.'], 400);
        }

        // Clean rule name
        $cleanRule = preg_replace('/[^a-zA-Z0-9_]/', '', $rule);

        // Normalize value
        if (is_bool($value)) {
            $normalizedValue = $value;
            $commandValue = $value ? 'true' : 'false';
        } elseif (is_numeric($value)) {
            $normalizedValue = (int) $value;
            $commandValue = (string) $normalizedValue;
        } else {
            $strVal = strtolower(trim((string) $value));
            if ($strVal === 'true' || $strVal === '1') {
                $normalizedValue = true;
                $commandValue = 'true';
            } elseif ($strVal === 'false' || $strVal === '0') {
                $normalizedValue = false;
                $commandValue = 'false';
            } else {
                $normalizedValue = (int) $strVal;
                $commandValue = (string) $normalizedValue;
            }
        }

        // Persist gamerule in server-gamerules.json
        $saved = $this->getSavedGamerules($server);
        $saved[$cleanRule] = $normalizedValue;
        $this->saveGamerules($server, $saved);

        // Send to online server console via Wings
        $commandSent = false;
        try {
            if ($this->commandRepository) {
                // Minecraft modern snake_case command
                $this->commandRepository->setServer($server)->send("gamerule {$cleanRule} {$commandValue}");
                $commandSent = true;

                // Also send legacy camelCase variant if mapped for 1.12-1.19 compatibility
                $legacyMap = [
                    'advance_time' => 'doDaylightCycle',
                    'advance_weather' => 'doWeatherCycle',
                    'spawn_mobs' => 'doMobSpawning',
                    'spawn_monsters' => 'doMobSpawning',
                    'block_drops' => 'doTileDrops',
                    'entity_drops' => 'doEntityDrops',
                    'fire_damage' => 'fireDamage',
                    'fall_damage' => 'fallDamage',
                    'drowning_damage' => 'drowningDamage',
                    'keep_inventory' => 'keepInventory',
                    'mob_griefing' => 'mobGriefing',
                    'pvp' => 'pvp',
                    'show_death_messages' => 'showDeathMessages',
                    'random_tick_speed' => 'randomTickSpeed',
                    'command_block_output' => 'commandBlockOutput',
                    'max_entity_cramming' => 'maxEntityCramming',
                    'reduced_debug_info' => 'reducedDebugInfo',
                    'immediate_respawn' => 'doImmediateRespawn',
                ];

                if (isset($legacyMap[$cleanRule])) {
                    $this->commandRepository->setServer($server)->send("gamerule {$legacyMap[$cleanRule]} {$commandValue}");
                }
            }
        } catch (Throwable $e) {}

        return response()->json([
            'success' => true,
            'rule' => $cleanRule,
            'value' => $normalizedValue,
            'command_sent' => $commandSent,
            'message' => "Gamerule '{$cleanRule}' set to {$commandValue}." . ($commandSent ? ' Applied immediately to online server.' : ' Saved to configuration.'),
        ]);
    }

    /**
     * Update world options (seed, difficulty, hardcore).
     * POST /api/client/servers/{server}/worlds/options
     */
    public function updateOptions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        try {
            if ($request->has('seed')) {
                $seed = trim((string) $request->input('seed', ''));
                $this->updateServerProperty($server, 'level-seed', $seed);
            }

            if ($request->has('difficulty')) {
                $difficulty = strtolower(trim((string) $request->input('difficulty', 'normal')));
                if (in_array($difficulty, ['peaceful', 'easy', 'normal', 'hard'])) {
                    $this->updateServerProperty($server, 'difficulty', $difficulty);
                    try {
                        if ($this->commandRepository) {
                            $this->commandRepository->setServer($server)->send("difficulty {$difficulty}");
                        }
                    } catch (Throwable $e) {}
                }
            }

            if ($request->has('hardcore')) {
                $hardcore = $request->boolean('hardcore');
                $this->updateServerProperty($server, 'hardcore', $hardcore ? 'true' : 'false');
            }

            return response()->json([
                'success' => true,
                'message' => 'World options updated successfully in server.properties.',
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to update options: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Toggle Aternos-style smart performance optimization.
     * POST /api/client/servers/{server}/worlds/optimize
     */
    public function optimize(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', 'world'));
        $enabled = $request->boolean('enabled', true);

        try {
            $settings = $this->getWorldSettings($server);
            if (!isset($settings[$worldName])) {
                $settings[$worldName] = [];
            }
            $settings[$worldName]['optimized'] = $enabled;
            $this->saveWorldSettings($server, $settings);

            if ($enabled) {
                // Smart Performance Tuning (Aternos-inspired preset)
                $this->updateServerProperty($server, 'simulation-distance', '6');
                $this->updateServerProperty($server, 'view-distance', '8');
                $this->updateServerProperty($server, 'entity-broadcast-range-percentage', '90');
                $this->updateServerProperty($server, 'network-compression-threshold', '256');

                // If paper-world-defaults.yml or spigot.yml exists, optimize chunk and entity ticks cleanly
                try {
                    $spigotContent = $this->fileRepository->setServer($server)->getContent('/spigot.yml');
                    if (!empty($spigotContent)) {
                        $spigotContent = preg_replace('/view-distance:\s*\d+/', 'view-distance: 8', $spigotContent);
                        $spigotContent = preg_replace('/simulation-distance:\s*\d+/', 'simulation-distance: 6', $spigotContent);
                        $this->fileRepository->setServer($server)->putContent('/spigot.yml', $spigotContent);
                    }
                } catch (Throwable $e) {}
            } else {
                // Restore standard defaults
                $this->updateServerProperty($server, 'simulation-distance', '10');
                $this->updateServerProperty($server, 'view-distance', '10');
                $this->updateServerProperty($server, 'entity-broadcast-range-percentage', '100');
            }

            return response()->json([
                'success' => true,
                'world' => $worldName,
                'optimized' => $enabled,
                'message' => $enabled
                    ? "Optimization enabled for world '{$worldName}'. Simulation distance set to 6 chunks, view distance to 8 chunks for smooth gameplay without vanilla compromises."
                    : "Optimization disabled for world '{$worldName}'. Restored standard simulation and view distances.",
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to apply optimization: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Toggle Force Upgrade (--forceUpgrade chunk conversion).
     * POST /api/client/servers/{server}/worlds/force-upgrade
     */
    public function forceUpgrade(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', 'world'));
        $enabled = $request->boolean('enabled', true);

        try {
            $settings = $this->getWorldSettings($server);
            if (!isset($settings[$worldName])) {
                $settings[$worldName] = [];
            }
            $settings[$worldName]['force_upgrade'] = $enabled;
            $this->saveWorldSettings($server, $settings);

            return response()->json([
                'success' => true,
                'world' => $worldName,
                'force_upgrade' => $enabled,
                'message' => $enabled
                    ? "Force upgrade flag enabled for world '{$worldName}'. The server will convert all world chunks to the current game version on next launch."
                    : "Force upgrade disabled for world '{$worldName}'.",
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to update force upgrade setting: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Compress world folder into a zip archive and prepare for download.
     * POST /api/client/servers/{server}/worlds/download
     */
    public function download(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', ''));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $worldName));

        if (empty($cleanWorld)) {
            return response()->json(['error' => 'Valid world name is required.'], 400);
        }

        try {
            $isNether = str_ends_with(strtolower($cleanWorld), '_nether');
            $isEnd = str_ends_with(strtolower($cleanWorld), '_the_end');

            $rootItems = [];
            try {
                $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
            } catch (Throwable $e) {}

            $rootFolders = [];
            if (is_array($rootItems)) {
                foreach ($rootItems as $item) {
                    $rootFolders[strtolower($item['name'] ?? '')] = true;
                }
            }

            if (isset($rootFolders[strtolower($cleanWorld)])) {
                $targets = [$cleanWorld];
                $archiveName = $this->fileRepository->setServer($server)->compressFiles('/', $targets);
            } elseif ($isNether) {
                $parent = str_replace(['_nether', '_NETHER'], '', $cleanWorld);
                $archiveName = $this->fileRepository->setServer($server)->compressFiles('/' . $parent, ['DIM-1']);
            } elseif ($isEnd) {
                $parent = str_replace(['_the_end', '_THE_END'], '', $cleanWorld);
                $archiveName = $this->fileRepository->setServer($server)->compressFiles('/' . $parent, ['DIM1']);
            } else {
                $targets = [$cleanWorld];
                if (isset($rootFolders[strtolower("{$cleanWorld}_nether")])) $targets[] = "{$cleanWorld}_nether";
                if (isset($rootFolders[strtolower("{$cleanWorld}_the_end")])) $targets[] = "{$cleanWorld}_the_end";
                $archiveName = $this->fileRepository->setServer($server)->compressFiles('/', $targets);
            }

            return response()->json([
                'success' => true,
                'message' => "World '{$cleanWorld}' compressed successfully.",
                'archive' => $archiveName,
                'file' => '/' . $archiveName,
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to prepare world download: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Unpack or finish uploading a world zip archive.
     * POST /api/client/servers/{server}/worlds/upload
     */
    public function upload(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $fileName = trim((string) $request->input('file_name', ''));
        $targetWorld = trim((string) $request->input('world', ''));

        if (empty($fileName)) {
            return response()->json(['error' => 'Archive file name is required.'], 400);
        }

        try {
            // Decompress archive in server root
            $this->fileRepository->setServer($server)->decompressFile('/', $fileName);

            // If targetWorld was specified and matches active world, update server.properties
            if (!empty($targetWorld)) {
                $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $targetWorld));
                $this->updateServerProperty($server, 'level-name', $cleanWorld);
            }

            return response()->json([
                'success' => true,
                'message' => "World archive '{$fileName}' extracted successfully into server. Restart server to load the new world terrain.",
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to decompress world archive: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Set active world in server.properties.
     * POST /api/client/servers/{server}/worlds/active
     */
    public function setActive(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', ''));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $worldName));

        if (empty($cleanWorld)) {
            return response()->json(['error' => 'Valid world name is required.'], 400);
        }

        try {
            $this->updateServerProperty($server, 'level-name', $cleanWorld);

            return response()->json([
                'success' => true,
                'message' => "Active world changed to '{$cleanWorld}'. Restart your server for the changes to take effect.",
                'active_world' => $cleanWorld,
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to update active world: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Create or regenerate a world.
     * POST /api/client/servers/{server}/worlds/create
     */
    public function create(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('name', ''));
        $seed = trim((string) $request->input('seed', ''));
        $worldType = trim((string) $request->input('world_type', 'default'));
        $createBackup = $request->boolean('create_backup', true);
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..', ' '], '', $worldName));

        if (empty($cleanWorld)) {
            return response()->json(['error' => 'Valid world name is required (letters, numbers, dashes, underscores only).'], 400);
        }

        try {
            // Optional: create a backup archive of the existing world first
            if ($createBackup) {
                try {
                    $targets = [$cleanWorld];
                    $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
                    if (is_array($rootItems)) {
                        foreach ($rootItems as $item) {
                            $name = $item['name'] ?? '';
                            if ($name === "{$cleanWorld}_nether" || $name === "{$cleanWorld}_the_end") {
                                $targets[] = $name;
                            }
                        }
                    }
                    $this->fileRepository->setServer($server)->compressFiles('/', $targets);
                } catch (Throwable $e) {}
            }

            // Create root folder if it doesn't already exist
            try {
                $this->fileRepository->setServer($server)->createDirectory($cleanWorld, '/');
            } catch (Throwable $e) {}

            $this->updateServerProperty($server, 'level-name', $cleanWorld);
            if (!empty($seed)) {
                $this->updateServerProperty($server, 'level-seed', $seed);
            }
            if (!empty($worldType)) {
                $this->updateServerProperty($server, 'level-type', $worldType);
            }

            return response()->json([
                'success' => true,
                'message' => "World '{$cleanWorld}' configured and set as active. Restart your server to generate fresh terrain.",
                'active_world' => $cleanWorld,
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to create/generate world: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Reset/Regenerate Nether or End dimension without affecting overworld.
     * POST /api/client/servers/{server}/worlds/reset-dimension
     */
    public function resetDimension(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', ''));
        $dimension = strtolower(trim((string) $request->input('dimension', '')));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $worldName));

        if (empty($cleanWorld) || !in_array($dimension, ['nether', 'end'])) {
            return response()->json(['error' => 'Valid world name and dimension (nether or end) are required.'], 400);
        }

        try {
            $deletedTargets = [];
            $parentWorld = str_replace(['_nether', '_the_end', '_NETHER', '_THE_END'], '', $cleanWorld);

            if ($dimension === 'nether') {
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/', ["{$parentWorld}_nether", "{$cleanWorld}"]);
                    $deletedTargets[] = "{$parentWorld}_nether";
                } catch (Throwable $e) {}

                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/' . $parentWorld, ['DIM-1']);
                    $deletedTargets[] = "{$parentWorld}/DIM-1";
                } catch (Throwable $e) {}

                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/' . $parentWorld . '/dimensions/minecraft', ['the_nether']);
                    $deletedTargets[] = "{$parentWorld}/dimensions/minecraft/the_nether";
                } catch (Throwable $e) {}
            } elseif ($dimension === 'end') {
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/', ["{$parentWorld}_the_end", "{$cleanWorld}"]);
                    $deletedTargets[] = "{$parentWorld}_the_end";
                } catch (Throwable $e) {}

                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/' . $parentWorld, ['DIM1']);
                    $deletedTargets[] = "{$parentWorld}/DIM1";
                } catch (Throwable $e) {}

                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/' . $parentWorld . '/dimensions/minecraft', ['the_end']);
                    $deletedTargets[] = "{$parentWorld}/dimensions/minecraft/the_end";
                } catch (Throwable $e) {}
            }

            return response()->json([
                'success' => true,
                'message' => ucfirst($dimension) . " dimension for world '{$parentWorld}' has been reset. Fresh dimension chunks will generate when players next enter.",
                'deleted' => $deletedTargets,
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to reset dimension: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Delete an inactive world and its dimension folders.
     * POST /api/client/servers/{server}/worlds/delete
     */
    public function delete(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', ''));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $worldName));

        if (empty($cleanWorld)) {
            return response()->json(['error' => 'Valid world name is required.'], 400);
        }

        $properties = $this->getServerProperties($server);
        $activeWorld = !empty($properties['level-name']) ? trim((string) $properties['level-name']) : 'world';

        if (strtolower($cleanWorld) === strtolower($activeWorld)) {
            return response()->json(['error' => "Cannot delete '{$cleanWorld}' because it is currently the active world in server.properties. Switch to another world first."], 400);
        }

        try {
            $toDelete = [$cleanWorld, "{$cleanWorld}_nether", "{$cleanWorld}_the_end"];
            $this->fileRepository->setServer($server)->deleteFiles('/', $toDelete);

            return response()->json([
                'success' => true,
                'message' => "World '{$cleanWorld}' and associated dimension folders deleted successfully.",
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to delete world: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Compress world folder into a backup archive.
     * POST /api/client/servers/{server}/worlds/backup
     */
    public function backup(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('world', ''));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..'], '', $worldName));

        if (empty($cleanWorld)) {
            return response()->json(['error' => 'Valid world name is required.'], 400);
        }

        try {
            $targets = [$cleanWorld];
            try {
                $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
                if (is_array($rootItems)) {
                    foreach ($rootItems as $item) {
                        $name = $item['name'] ?? '';
                        if ($name === "{$cleanWorld}_nether" || $name === "{$cleanWorld}_the_end") {
                            $targets[] = $name;
                        }
                    }
                }
            } catch (Throwable $e) {}

            $archiveName = $this->fileRepository->setServer($server)->compressFiles('/', $targets);

            return response()->json([
                'success' => true,
                'message' => "World '{$cleanWorld}' compressed successfully as {$archiveName}.",
                'archive' => $archiveName,
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to create world backup archive: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Read world-settings.json.
     */
    protected function getWorldSettings(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/world-settings.json');
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        } catch (Throwable $e) {}

        return [];
    }

    /**
     * Save world-settings.json.
     */
    protected function saveWorldSettings(Server $server, array $settings): void
    {
        $this->fileRepository->setServer($server)->putContent(
            '/world-settings.json',
            json_encode($settings, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Read server-gamerules.json.
     */
    protected function getSavedGamerules(Server $server): array
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/server-gamerules.json');
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        } catch (Throwable $e) {}

        return [];
    }

    /**
     * Save server-gamerules.json.
     */
    protected function saveGamerules(Server $server, array $gamerules): void
    {
        $this->fileRepository->setServer($server)->putContent(
            '/server-gamerules.json',
            json_encode($gamerules, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }

    /**
     * Read and parse key-value pairs from server.properties.
     */
    protected function getServerProperties(Server $server): array
    {
        $result = [];
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/server.properties');
            $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $content));
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (empty($trimmed) || str_starts_with($trimmed, '#')) {
                    continue;
                }
                $parts = explode('=', $trimmed, 2);
                if (count($parts) === 2) {
                    $result[trim($parts[0])] = trim($parts[1]);
                }
            }
        } catch (Throwable $e) {}

        return $result;
    }

    /**
     * Safely update a single property in server.properties.
     */
    protected function updateServerProperty(Server $server, string $key, string $value): void
    {
        $content = '';
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/server.properties');
        } catch (Throwable $e) {}

        $lines = explode("\n", str_replace(["\r\n", "\r"], "\n", $content));
        $found = false;
        $newLines = [];

        foreach ($lines as $line) {
            $trimmed = trim($line);
            if (!empty($trimmed) && !str_starts_with($trimmed, '#') && str_starts_with($trimmed, "{$key}=")) {
                $newLines[] = "{$key}={$value}";
                $found = true;
            } else {
                $newLines[] = $line;
            }
        }

        if (!$found) {
            $newLines[] = "{$key}={$value}";
        }

        $this->fileRepository->setServer($server)->putContent(
            '/server.properties',
            implode("\n", $newLines)
        );
    }
}
