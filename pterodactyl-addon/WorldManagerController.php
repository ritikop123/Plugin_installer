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
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class WorldManagerController extends ClientApiController
{
    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
    }

    /**
     * List all detected Minecraft worlds, active level-name, seeds, and dimension status.
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

            $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
            $worlds = [];
            $seenWorlds = [];

            if (is_array($rootItems)) {
                // First pass: identify all world root folders
                foreach ($rootItems as $item) {
                    $name = $item['name'] ?? '';
                    $isDir = !empty($item['directory']) || !empty($item['is_directory']) || empty($item['file']);

                    if (!$isDir || empty($name) || $name === '.' || $name === '..' || str_starts_with($name, '.')) {
                        continue;
                    }

                    // Ignore standard non-world Minecraft server directories
                    $ignoredFolders = ['plugins', 'mods', 'config', 'defaultconfigs', 'logs', 'crash-reports', 'libraries', 'versions', 'cache', 'core', 'web', 'resourcepacks'];
                    if (in_array(strtolower($name), $ignoredFolders)) {
                        continue;
                    }

                    // Check if it's a nether or end auxiliary folder (e.g. world_nether, world_the_end)
                    if (str_ends_with(strtolower($name), '_nether') || str_ends_with(strtolower($name), '_the_end')) {
                        continue;
                    }

                    // Inspect directory contents to confirm it's a Minecraft world
                    $isWorld = false;
                    $hasLevelDat = false;
                    $hasRegion = false;
                    $hasDimMinus1 = false;
                    $hasDim1 = false;

                    try {
                        $subItems = $this->fileRepository->setServer($server)->getDirectory('/' . $name);
                        if (is_array($subItems)) {
                            foreach ($subItems as $sub) {
                                $subName = strtolower($sub['name'] ?? '');
                                if ($subName === 'level.dat') $hasLevelDat = true;
                                if ($subName === 'region') $hasRegion = true;
                                if ($subName === 'dim-1') $hasDimMinus1 = true;
                                if ($subName === 'dim1') $hasDim1 = true;
                            }
                        }
                    } catch (Throwable $e) {}

                    if ($hasLevelDat || $hasRegion || $name === $activeWorld) {
                        $isWorld = true;
                    }

                    if ($isWorld) {
                        // Check for Bukkit-style separate dimension folders
                        $netherFolderExists = false;
                        $endFolderExists = false;

                        foreach ($rootItems as $checkItem) {
                            $checkName = $checkItem['name'] ?? '';
                            if ($checkName === "{$name}_nether") $netherFolderExists = true;
                            if ($checkName === "{$name}_the_end") $endFolderExists = true;
                        }

                        $worlds[] = [
                            'name' => $name,
                            'is_active' => ($name === $activeWorld),
                            'size' => (int) ($item['size'] ?? 0),
                            'modified_at' => $item['modified_at'] ?? $item['modifiedAt'] ?? '',
                            'has_level_dat' => $hasLevelDat,
                            'has_overworld' => $hasRegion || $hasLevelDat,
                            'has_nether' => $hasDimMinus1 || $netherFolderExists,
                            'nether_type' => $netherFolderExists ? 'folder' : ($hasDimMinus1 ? 'subfolder' : 'none'),
                            'has_end' => $hasDim1 || $endFolderExists,
                            'end_type' => $endFolderExists ? 'folder' : ($hasDim1 ? 'subfolder' : 'none'),
                        ];
                        $seenWorlds[$name] = true;
                    }
                }
            }

            // Always ensure the active world is listed even if newly configured
            if (!isset($seenWorlds[$activeWorld])) {
                array_unshift($worlds, [
                    'name' => $activeWorld,
                    'is_active' => true,
                    'size' => 0,
                    'modified_at' => '',
                    'has_level_dat' => false,
                    'has_overworld' => true,
                    'has_nether' => true,
                    'nether_type' => 'folder',
                    'has_end' => true,
                    'end_type' => 'folder',
                ]);
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
     * Create a new world and set it as active in server.properties.
     * POST /api/client/servers/{server}/worlds/create
     */
    public function create(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $worldName = trim((string) $request->input('name', ''));
        $seed = trim((string) $request->input('seed', ''));
        $cleanWorld = basename(str_replace(['\\', '/', "\0", '..', ' '], '', $worldName));

        if (empty($cleanWorld)) {
            return response()->json(['error' => 'Valid world name is required (letters, numbers, dashes, underscores only).'], 400);
        }

        try {
            // Create root folder if it doesn't already exist
            try {
                $this->fileRepository->setServer($server)->createDirectory($cleanWorld, '/');
            } catch (Throwable $e) {}

            $this->updateServerProperty($server, 'level-name', $cleanWorld);
            if (!empty($seed)) {
                $this->updateServerProperty($server, 'level-seed', $seed);
            }

            return response()->json([
                'success' => true,
                'message' => "World '{$cleanWorld}' created and set as active. Restart your server to generate fresh terrain.",
                'active_world' => $cleanWorld,
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Failed to create world: ' . $e->getMessage()], 500);
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

            if ($dimension === 'nether') {
                // Bukkit / Paper style: world_nether folder
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/', ["{$cleanWorld}_nether"]);
                    $deletedTargets[] = "{$cleanWorld}_nether";
                } catch (Throwable $e) {}

                // Vanilla / Fabric / Forge style: world/DIM-1 folder
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/' . $cleanWorld, ['DIM-1']);
                    $deletedTargets[] = "{$cleanWorld}/DIM-1";
                } catch (Throwable $e) {}
            } elseif ($dimension === 'end') {
                // Bukkit / Paper style: world_the_end folder
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/', ["{$cleanWorld}_the_end"]);
                    $deletedTargets[] = "{$cleanWorld}_the_end";
                } catch (Throwable $e) {}

                // Vanilla / Fabric / Forge style: world/DIM1 folder
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/' . $cleanWorld, ['DIM1']);
                    $deletedTargets[] = "{$cleanWorld}/DIM1";
                } catch (Throwable $e) {}
            }

            return response()->json([
                'success' => true,
                'message' => ucfirst($dimension) . " dimension for world '{$cleanWorld}' has been reset. Fresh dimension chunks will generate when players next enter.",
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
            // Also include dimension folders if they exist
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
