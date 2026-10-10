<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class PluginInstallerController extends ClientApiController
{
    private const MODRINTH_API = 'https://api.modrinth.com/v2/';
    private const SPIGET_API = 'https://api.spiget.org/v2/';
    private const HANGAR_API = 'https://hangar.papermc.io/api/v1/';
    private const CURSE_API = 'https://api.curse.tools/v1/cf/';
    private const USER_AGENT = 'Arix-Plugin-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)';

    protected Client $httpClient;
    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->httpClient = new Client([
            'headers' => [
                'User-Agent' => self::USER_AGENT,
                'Accept' => 'application/json',
            ],
            'timeout' => 15.0,
            'http_errors' => false,
        ]);
    }

    /**
     * Search plugins across Modrinth, SpigotMC, Hangar, and CurseForge.
     * GET /api/client/servers/{server}/plugins
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $provider = strtolower(trim((string) $request->query('provider', 'modrinth')));
        $query = trim((string) $request->query('query', ''));
        $loader = strtolower(trim((string) $request->query('loader', 'all')));
        $gameVersion = trim((string) $request->query('game_version', 'all'));
        $sortBy = trim((string) $request->query('sort_by', 'downloads'));
        $page = max(1, (int) $request->query('page', 1));
        $limit = 21;

        switch ($provider) {
            case 'spigotmc':
            case 'spigot':
                return $this->searchSpigot($query, $page, $limit);
            case 'hangar':
                return $this->searchHangar($query, $page, $limit);
            case 'curseforge':
            case 'curse':
                return $this->searchCurseForge($query, $gameVersion, $sortBy, $page, $limit);
            case 'modrinth':
            default:
                return $this->searchModrinth($query, $loader, $gameVersion, $sortBy, $page, $limit);
        }
    }

    /**
     * Search Modrinth plugins.
     */
    protected function searchModrinth(string $query, string $loader, string $gameVersion, string $sortBy, int $page, int $limit): JsonResponse
    {
        $offset = ($page - 1) * $limit;
        $facets = [];
        $facets[] = ['project_type:plugin'];

        $allowedPluginLoaders = ['paper', 'purpur', 'folia', 'spigot', 'velocity', 'waterfall', 'bungeecord', 'bukkit'];
        if ($loader !== 'all' && !empty($loader) && in_array($loader, $allowedPluginLoaders)) {
            $facets[] = ["categories:{$loader}"];
        } else {
            $facets[] = array_map(fn ($l) => "categories:{$l}", $allowedPluginLoaders);
        }

        if ($gameVersion !== 'all' && !empty($gameVersion)) {
            $facets[] = ["versions:{$gameVersion}"];
        }

        $params = [
            'query' => $query,
            'limit' => $limit,
            'offset' => $offset,
            'index' => in_array($sortBy, ['downloads', 'relevance', 'updated', 'newest']) ? $sortBy : 'downloads',
        ];

        if (!empty($facets)) {
            $params['facets'] = json_encode($facets);
        }

        try {
            $response = $this->httpClient->get(self::MODRINTH_API . 'search', ['query' => $params]);
            $data = json_decode($response->getBody()->getContents(), true);
            $hits = $data['hits'] ?? [];
            foreach ($hits as &$h) {
                $h['provider'] = 'modrinth';
            }
            return response()->json([
                'hits' => $hits,
                'total_hits' => $data['total_hits'] ?? count($hits),
                'provider' => 'modrinth',
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Modrinth API error: ' . $e->getMessage()], 502);
        }
    }

    /**
     * Search SpigotMC resources using Spiget API.
     */
    protected function searchSpigot(string $query, int $page, int $limit): JsonResponse
    {
        try {
            $url = empty($query)
                ? self::SPIGET_API . 'resources'
                : self::SPIGET_API . 'search/resources/' . rawurlencode($query);

            $response = $this->httpClient->get($url, [
                'query' => [
                    'size' => $limit,
                    'page' => $page,
                    'sort' => '-downloads',
                ],
            ]);

            $raw = json_decode($response->getBody()->getContents(), true);
            $items = is_array($raw) ? $raw : [];
            $hits = [];

            foreach ($items as $item) {
                if (empty($item['id']) || empty($item['name'])) continue;

                $iconUrl = null;
                if (!empty($item['icon']['url'])) {
                    $iconUrl = 'https://www.spigotmc.org/' . ltrim($item['icon']['url'], '/');
                } elseif (!empty($item['icon']['data'])) {
                    $iconUrl = 'data:image/png;base64,' . $item['icon']['data'];
                }

                $hits[] = [
                    'project_id' => (string) $item['id'],
                    'id' => (string) $item['id'],
                    'slug' => Str::slug($item['name']) ?: (string) $item['id'],
                    'title' => $item['name'],
                    'author' => !empty($item['author']['id']) ? 'Author #' . $item['author']['id'] : 'SpigotMC',
                    'description' => $item['tag'] ?? 'SpigotMC Resource',
                    'categories' => ['spigot', 'bukkit'],
                    'versions' => [],
                    'downloads' => (int) ($item['downloads'] ?? 0),
                    'follows' => (int) ($item['likes'] ?? 0),
                    'icon_url' => $iconUrl,
                    'provider' => 'spigotmc',
                ];
            }

            return response()->json([
                'hits' => $hits,
                'total_hits' => count($hits) >= $limit ? 500 : count($hits),
                'provider' => 'spigotmc',
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'SpigotMC API error: ' . $e->getMessage()], 502);
        }
    }

    /**
     * Search PaperMC Hangar plugins.
     */
    protected function searchHangar(string $query, int $page, int $limit): JsonResponse
    {
        try {
            $offset = ($page - 1) * $limit;
            $params = [
                'limit' => $limit,
                'offset' => $offset,
                'sort' => '-downloads',
            ];
            if (!empty($query)) {
                $params['q'] = $query;
            }

            $response = $this->httpClient->get(self::HANGAR_API . 'projects', [
                'query' => $params,
            ]);

            $raw = json_decode($response->getBody()->getContents(), true);
            $items = $raw['result'] ?? [];
            $total = $raw['pagination']['count'] ?? count($items);
            $hits = [];

            foreach ($items as $item) {
                $slug = $item['namespace']['slug'] ?? (string) $item['id'];
                $hits[] = [
                    'project_id' => $slug,
                    'id' => $slug,
                    'slug' => $slug,
                    'title' => $item['name'] ?? $slug,
                    'author' => $item['namespace']['owner'] ?? 'Hangar',
                    'description' => $item['description'] ?? 'PaperMC Hangar Plugin',
                    'categories' => ['paper', 'purpur', 'velocity'],
                    'versions' => [],
                    'downloads' => (int) ($item['stats']['downloads'] ?? 0),
                    'follows' => (int) ($item['stats']['stars'] ?? 0),
                    'icon_url' => $item['avatarUrl'] ?? null,
                    'provider' => 'hangar',
                ];
            }

            return response()->json([
                'hits' => $hits,
                'total_hits' => $total,
                'provider' => 'hangar',
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Hangar API error: ' . $e->getMessage()], 502);
        }
    }

    /**
     * Search CurseForge plugins (Bukkit classId = 5).
     */
    protected function searchCurseForge(string $query, string $gameVersion, string $sortBy, int $page, int $limit): JsonResponse
    {
        try {
            $offset = ($page - 1) * $limit;
            $params = [
                'gameId' => 432,
                'classId' => 5, // Bukkit Plugins
                'index' => $offset,
                'pageSize' => $limit,
                'sortField' => 2, // Popularity / downloads
                'sortOrder' => 'desc',
            ];

            if (!empty($query)) {
                $params['searchFilter'] = $query;
            }
            if (!empty($gameVersion) && $gameVersion !== 'all') {
                $params['gameVersion'] = $gameVersion;
            }

            $response = $this->httpClient->get(self::CURSE_API . 'mods/search', [
                'query' => $params,
            ]);

            $raw = json_decode($response->getBody()->getContents(), true);
            $items = $raw['data'] ?? [];
            $total = $raw['pagination']['totalCount'] ?? count($items);
            $hits = [];

            foreach ($items as $item) {
                $hits[] = [
                    'project_id' => (string) $item['id'],
                    'id' => (string) $item['id'],
                    'slug' => $item['slug'] ?? (string) $item['id'],
                    'title' => $item['name'] ?? 'CurseForge Plugin',
                    'author' => !empty($item['authors'][0]['name']) ? $item['authors'][0]['name'] : 'CurseForge',
                    'description' => $item['summary'] ?? '',
                    'categories' => array_values(array_filter(array_map(fn($c) => strtolower($c['name'] ?? ''), $item['categories'] ?? []))),
                    'versions' => [],
                    'downloads' => (int) ($item['downloadCount'] ?? 0),
                    'follows' => (int) ($item['thumbsUpCount'] ?? 0),
                    'icon_url' => $item['logo']['thumbnailUrl'] ?? $item['logo']['url'] ?? null,
                    'provider' => 'curseforge',
                ];
            }

            return response()->json([
                'hits' => $hits,
                'total_hits' => $total,
                'provider' => 'curseforge',
            ]);
        } catch (Throwable $e) {
            return response()->json(['error' => 'CurseForge API error: ' . $e->getMessage()], 502);
        }
    }

    /**
     * Get versions for a specific plugin from chosen provider.
     * GET /api/client/servers/{server}/plugins/versions?plugin=<project_id>&provider=<provider>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $pluginId = trim((string) $request->query('plugin', ''));
        $provider = strtolower(trim((string) $request->query('provider', 'modrinth')));

        if (empty($pluginId)) {
            return response()->json(['error' => 'Valid plugin ID or slug is required.'], 400);
        }

        switch ($provider) {
            case 'spigotmc':
            case 'spigot':
                return $this->getSpigotVersions($pluginId);
            case 'hangar':
                return $this->getHangarVersions($pluginId);
            case 'curseforge':
            case 'curse':
                return $this->getCurseForgeVersions($pluginId);
            case 'modrinth':
            default:
                return $this->getModrinthVersions($pluginId, $request);
        }
    }

    protected function getModrinthVersions(string $pluginId, Request $request): JsonResponse
    {
        $query = [];
        $loader = strtolower(trim((string) $request->query('loader', '')));
        $allowedPluginLoaders = ['paper', 'purpur', 'folia', 'spigot', 'velocity', 'waterfall', 'bungeecord', 'bukkit'];

        if (!empty($loader) && in_array($loader, $allowedPluginLoaders)) {
            $query['loaders'] = json_encode([$loader]);
        } else {
            $query['loaders'] = json_encode($allowedPluginLoaders);
        }

        $gameVersion = trim((string) $request->query('game_version', $request->query('version', '')));
        if (!empty($gameVersion) && $gameVersion !== 'all') {
            $query['game_versions'] = json_encode([$gameVersion]);
        }

        try {
            $response = $this->httpClient->get(self::MODRINTH_API . "project/{$pluginId}/version", [
                'query' => $query,
            ]);
            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json(is_array($data) ? $data : []);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Modrinth API error: ' . $e->getMessage()], 502);
        }
    }

    protected function getSpigotVersions(string $pluginId): JsonResponse
    {
        try {
            $response = $this->httpClient->get(self::SPIGET_API . "resources/{$pluginId}/versions", [
                'query' => ['size' => 15, 'sort' => '-releaseDate'],
            ]);
            $raw = json_decode($response->getBody()->getContents(), true);
            $items = is_array($raw) ? $raw : [];
            $versions = [];

            foreach ($items as $item) {
                $verName = $item['name'] ?? 'Latest';
                $verId = (string) ($item['id'] ?? $verName);
                $downloadUrl = self::SPIGET_API . "resources/{$pluginId}/download";
                $filename = "spigot-{$pluginId}-{$verName}.jar";

                $versions[] = [
                    'id' => $verId,
                    'name' => "Version " . $verName,
                    'version_number' => $verName,
                    'game_versions' => ['Any Spigot / Bukkit Version'],
                    'version_type' => 'release',
                    'loaders' => ['spigot', 'paper', 'bukkit'],
                    'files' => [
                        [
                            'url' => $downloadUrl,
                            'filename' => $filename,
                            'primary' => true,
                            'size' => 0,
                        ],
                    ],
                    'provider' => 'spigotmc',
                ];
            }

            if (empty($versions)) {
                $versions[] = [
                    'id' => 'latest',
                    'name' => 'Latest Version',
                    'version_number' => 'latest',
                    'game_versions' => ['Any Spigot / Bukkit Version'],
                    'version_type' => 'release',
                    'loaders' => ['spigot', 'paper', 'bukkit'],
                    'files' => [
                        [
                            'url' => self::SPIGET_API . "resources/{$pluginId}/download",
                            'filename' => "spigot-{$pluginId}.jar",
                            'primary' => true,
                            'size' => 0,
                        ],
                    ],
                    'provider' => 'spigotmc',
                ];
            }

            return response()->json($versions);
        } catch (Throwable $e) {
            return response()->json(['error' => 'SpigotMC versions error: ' . $e->getMessage()], 502);
        }
    }

    protected function getHangarVersions(string $pluginId): JsonResponse
    {
        try {
            $response = $this->httpClient->get(self::HANGAR_API . "projects/{$pluginId}/versions", [
                'query' => ['limit' => 15],
            ]);
            $raw = json_decode($response->getBody()->getContents(), true);
            $items = $raw['result'] ?? [];
            $versions = [];

            foreach ($items as $item) {
                $verName = $item['name'] ?? '1.0';
                $downloads = $item['downloads'] ?? [];
                $fileUrl = null;
                $fileName = "{$pluginId}-{$verName}.jar";
                $fileSize = 0;

                foreach (['PAPER', 'WATERFALL', 'VELOCITY'] as $platform) {
                    if (!empty($downloads[$platform]['downloadUrl'])) {
                        $fileUrl = $downloads[$platform]['downloadUrl'];
                        $fileSize = $downloads[$platform]['fileInfo']['sizeBytes'] ?? 0;
                        if (!empty($downloads[$platform]['fileInfo']['name'])) {
                            $fileName = $downloads[$platform]['fileInfo']['name'];
                        }
                        break;
                    } elseif (!empty($downloads[$platform]['externalUrl'])) {
                        $fileUrl = $downloads[$platform]['externalUrl'];
                        break;
                    }
                }

                if (empty($fileUrl)) {
                    $fileUrl = self::HANGAR_API . "projects/{$pluginId}/versions/{$verName}/PAPER/download";
                }

                $gameVers = [];
                if (!empty($item['platformDependencies'])) {
                    foreach ($item['platformDependencies'] as $pd) {
                        $gameVers = array_merge($gameVers, $pd);
                    }
                }

                $versions[] = [
                    'id' => (string) ($item['id'] ?? $verName),
                    'name' => "Version " . $verName,
                    'version_number' => $verName,
                    'game_versions' => !empty($gameVers) ? array_values(array_unique($gameVers)) : ['Paper / Velocity'],
                    'version_type' => 'release',
                    'loaders' => ['paper', 'purpur', 'velocity'],
                    'files' => [
                        [
                            'url' => $fileUrl,
                            'filename' => $fileName,
                            'primary' => true,
                            'size' => $fileSize,
                        ],
                    ],
                    'provider' => 'hangar',
                ];
            }

            return response()->json($versions);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Hangar versions error: ' . $e->getMessage()], 502);
        }
    }

    protected function getCurseForgeVersions(string $pluginId): JsonResponse
    {
        try {
            $response = $this->httpClient->get(self::CURSE_API . "mods/{$pluginId}/files", [
                'query' => ['pageSize' => 20],
            ]);
            $raw = json_decode($response->getBody()->getContents(), true);
            $items = $raw['data'] ?? [];
            $versions = [];

            foreach ($items as $f) {
                $downloadUrl = $f['downloadUrl'] ?? null;
                $fileId = (string) $f['id'];
                $fileName = $f['fileName'] ?? "curse-plugin-{$fileId}.jar";

                if (empty($downloadUrl) && strlen($fileId) > 4) {
                    $part1 = substr($fileId, 0, 4);
                    $part2 = substr($fileId, 4);
                    $downloadUrl = "https://edge.forgecdn.net/files/{$part1}/{$part2}/" . rawurlencode($fileName);
                }

                if (empty($downloadUrl)) continue;

                $versions[] = [
                    'id' => $fileId,
                    'name' => $f['displayName'] ?? $fileName,
                    'version_number' => $f['displayName'] ?? $fileId,
                    'game_versions' => $f['gameVersions'] ?? ['Any'],
                    'version_type' => ($f['releaseType'] ?? 1) === 1 ? 'release' : 'beta',
                    'loaders' => ['bukkit', 'spigot', 'paper'],
                    'date_published' => $f['fileDate'] ?? null,
                    'files' => [
                        [
                            'url' => $downloadUrl,
                            'filename' => $fileName,
                            'primary' => true,
                            'size' => $f['fileLength'] ?? 0,
                        ],
                    ],
                    'provider' => 'curseforge',
                ];
            }

            return response()->json($versions);
        } catch (Throwable $e) {
            return response()->json(['error' => 'CurseForge files error: ' . $e->getMessage()], 502);
        }
    }

    /**
     * Get dynamic Minecraft game version tags from Modrinth.
     * GET /api/client/servers/{server}/plugins/tags
     */
    public function tags(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $response = $this->httpClient->get(self::MODRINTH_API . 'tag/game_version');
            if ($response->getStatusCode() === 200) {
                $data = json_decode($response->getBody()->getContents(), true);
                if (is_array($data)) {
                    $releases = array_values(array_filter($data, function ($item) {
                        return isset($item['version_type']) && $item['version_type'] === 'release';
                    }));
                    return response()->json($releases);
                }
            }
        } catch (Exception $e) {}

        return response()->json([]);
    }

    /**
     * Install plugin file into the server container's /plugins directory.
     * POST /api/client/servers/{server}/plugins/install
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $url = (string) $request->input('url', '');
        $filename = (string) $request->input('filename', '');

        // 1. Validate URL: require HTTPS
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['error' => 'Invalid file download URL.'], 400);
        }

        $parsedUrl = parse_url($url);
        if (($parsedUrl['scheme'] ?? '') !== 'https') {
            return response()->json(['error' => 'Only secure HTTPS download URLs are permitted.'], 400);
        }

        $host = strtolower($parsedUrl['host'] ?? '');
        $allowedHosts = [
            'cdn.modrinth.com',
            'api.modrinth.com',
            'api.spiget.org',
            'spiget.org',
            'hangarcdn.papermc.io',
            'hangar.papermc.io',
            'edge.forgecdn.net',
            'mediafilez.forgecdn.net',
            'media.forgecdn.net',
            'curseforge.com',
            'api.curse.tools',
            'github.com',
            'objects.githubusercontent.com',
        ];

        $isAllowedHost = false;
        foreach ($allowedHosts as $allowed) {
            if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
                $isAllowedHost = true;
                break;
            }
        }

        if (!$isAllowedHost) {
            return response()->json(['error' => "Untrusted download host ({$host}). Only verified plugin CDN URLs are allowed."], 400);
        }

        // 2. Validate Filename
        if (empty($filename)) {
            return response()->json(['error' => 'Filename is required.'], 400);
        }

        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));

        if (
            empty($cleanFilename) ||
            $cleanFilename === '.' ||
            $cleanFilename === '..' ||
            !preg_match('/^[a-zA-Z0-9_\-\.\+]+$/', $cleanFilename) ||
            !preg_match('/\.(jar|zip)$/i', $cleanFilename)
        ) {
            return response()->json(['error' => 'Invalid plugin filename. Filename must end with .jar or .zip and contain no path characters.'], 400);
        }

        try {
            // 3. Ensure the /plugins directory exists
            try {
                $this->fileRepository->setServer($server)->createDirectory('plugins', '/');
            } catch (Exception $e) {}

            // 4. Command Wings to pull the file directly into /plugins
            $this->fileRepository->setServer($server)->pull(
                $url,
                '/plugins',
                [
                    'filename' => $cleanFilename,
                    'use_header' => true,
                    'foreground' => true,
                ]
            );

            return response()->json([
                'success' => true,
                'message' => "Plugin {$cleanFilename} installed successfully into /plugins.",
                'filename' => $cleanFilename,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to install plugin to server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * List all installed plugin files from /plugins.
     * GET /api/client/servers/{server}/plugins/installed
     */
    public function installed(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory('/plugins');
            $files = [];
            if (is_array($items)) {
                foreach ($items as $item) {
                    $name = $item['name'] ?? '';
                    $isFile = !empty($item['file']) || !empty($item['is_file']) || (isset($item['directory']) && !$item['directory']);
                    if ($isFile && preg_match('/\.(jar|zip)$/i', $name)) {
                        $files[] = [
                            'name' => $name,
                            'size' => (int) ($item['size'] ?? 0),
                            'modified_at' => $item['modified_at'] ?? $item['modifiedAt'] ?? '',
                        ];
                    }
                }
            }
            return response()->json($files);
        } catch (Exception $e) {
            return response()->json([]);
        }
    }

    /**
     * Delete an installed plugin file from /plugins.
     * POST /api/client/servers/{server}/plugins/delete
     */
    public function delete(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $filename = (string) $request->input('filename', '');
        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));

        if (empty($cleanFilename) || !preg_match('/\.(jar|zip)$/i', $cleanFilename)) {
            return response()->json(['error' => 'Invalid plugin filename to delete.'], 400);
        }

        try {
            $this->fileRepository->setServer($server)->deleteFiles('/plugins', [$cleanFilename]);
            return response()->json([
                'success' => true,
                'message' => "Plugin {$cleanFilename} uninstalled successfully.",
                'filename' => $cleanFilename,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to delete plugin file from server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
