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
use Illuminate\Support\Facades\Cache;
use GuzzleHttp\Promise\Utils;

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
     * Clean plugin name by removing version brackets, tags, and common title separators.
     */
    protected function cleanPluginName(string $rawName): string
    {
        $name = trim($rawName);
        // Remove version tags in brackets or parentheses: [1.8 - 1.21], (FAWE), [UPDATED], etc.
        $name = preg_replace('/(\[[^\]]*\]|\([^\)]*\))/u', ' ', $name);
        // Split on common tagline separators: ' | ', ' - ', ' — ', ' : ', ' / '
        $parts = preg_split('/(?:\s+[|–—:\/]\s+|\s+-\s+)/u', $name);
        $candidate = trim($parts[0] ?? $name);
        if (empty($candidate)) {
            $candidate = $name;
        }
        // Remove characters unsafe for filenames but keep alphanumeric, dash, dot, space, underscore
        $candidate = preg_replace('/[^a-zA-Z0-9_\-\.\+ ]/u', '', $candidate);
        $candidate = trim(preg_replace('/\s+/', ' ', $candidate));

        return !empty($candidate) ? $candidate : 'plugin';
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

                $cleanTitle = $this->cleanPluginName($item['name']);

                $hits[] = [
                    'project_id' => (string) $item['id'],
                    'id' => (string) $item['id'],
                    'slug' => Str::slug($cleanTitle) ?: (string) $item['id'],
                    'title' => $item['name'],
                    'clean_title' => $cleanTitle,
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
                return $this->getSpigotVersions($pluginId, $request);
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

    protected function getSpigotVersions(string $pluginId, Request $request): JsonResponse
    {
        try {
            // Get plugin title/name if passed, or fetch resource from Spiget
            $rawTitle = trim((string) $request->query('title', $request->query('name', $request->query('slug', ''))));
            $externalUrl = null;

            if (empty($rawTitle)) {
                try {
                    $resInfo = $this->httpClient->get(self::SPIGET_API . "resources/{$pluginId}", ['timeout' => 5]);
                    if ($resInfo->getStatusCode() === 200) {
                        $resData = json_decode($resInfo->getBody()->getContents(), true);
                        if (!empty($resData['name'])) {
                            $rawTitle = $resData['name'];
                        }
                        if (!empty($resData['file']['externalUrl'])) {
                            $externalUrl = $resData['file']['externalUrl'];
                        }
                    }
                } catch (Throwable $e) {}
            }

            $cleanBase = $this->cleanPluginName($rawTitle ?: "plugin-{$pluginId}");

            $response = $this->httpClient->get(self::SPIGET_API . "resources/{$pluginId}/versions", [
                'query' => ['size' => 15, 'sort' => '-releaseDate'],
            ]);
            $raw = json_decode($response->getBody()->getContents(), true);
            $items = is_array($raw) ? $raw : [];
            $versions = [];

            foreach ($items as $item) {
                $verName = $item['name'] ?? 'Latest';
                $verId = (string) ($item['id'] ?? $verName);
                $downloadUrl = !empty($externalUrl) ? $externalUrl : (self::SPIGET_API . "resources/{$pluginId}/download");

                $cleanVer = trim(preg_replace('/[^a-zA-Z0-9_\.\-]/', '', $verName));
                if (!empty($cleanVer) && strtolower($cleanVer) !== 'latest') {
                    $filename = "{$cleanBase}-{$cleanVer}.jar";
                } else {
                    $filename = "{$cleanBase}.jar";
                }

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
                $downloadUrl = !empty($externalUrl) ? $externalUrl : (self::SPIGET_API . "resources/{$pluginId}/download");
                $versions[] = [
                    'id' => 'latest',
                    'name' => 'Latest Version',
                    'version_number' => 'latest',
                    'game_versions' => ['Any Spigot / Bukkit Version'],
                    'version_type' => 'release',
                    'loaders' => ['spigot', 'paper', 'bukkit'],
                    'files' => [
                        [
                            'url' => $downloadUrl,
                            'filename' => "{$cleanBase}.jar",
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
                    $part2 = ltrim(substr($fileId, 4), '0') ?: '0';
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
        $pluginTitle = (string) $request->input('title', '');
        $iconUrl = (string) $request->input('icon_url', '');
        $pluginId = (string) $request->input('plugin_id', '');
        $slug = (string) $request->input('slug', '');
        $provider = (string) $request->input('provider', '');

        // 1. Resolve potential Spiget / CDN redirects to direct download URLs
        if (str_contains($url, 'api.spiget.org') && str_contains($url, '/download')) {
            try {
                $headRes = $this->httpClient->get($url, [
                    'allow_redirects' => false,
                    'timeout' => 6,
                ]);
                if ($headRes->getStatusCode() >= 300 && $headRes->getStatusCode() < 400) {
                    $loc = $headRes->getHeaderLine('Location');
                    if (!empty($loc)) {
                        if (str_starts_with($loc, '/')) {
                            $url = 'https://api.spiget.org' . $loc;
                        } else {
                            $url = $loc;
                        }
                    }
                }
            } catch (Throwable $e) {}
        }

        // 2. Resolve GitHub release tag page or tag redirect to direct .jar release asset
        if (str_contains($url, 'github.com') && preg_match('{github\.com/([^/]+)/([^/]+)/releases/(?:tag|expanded_assets)/([^/?#]+)}i', $url, $m)) {
            $ghOwner = $m[1];
            $ghRepo = $m[2];
            $ghTag = $m[3];
            $resolvedJarUrl = null;
            $resolvedJarName = null;

            // Attempt A: Official GitHub API
            try {
                $ghApi = "https://api.github.com/repos/{$ghOwner}/{$ghRepo}/releases/tags/{$ghTag}";
                $ghRes = $this->httpClient->get($ghApi, [
                    'headers' => [
                        'User-Agent' => self::USER_AGENT,
                        'Accept' => 'application/vnd.github.v3+json',
                    ],
                    'timeout' => 6,
                ]);
                if ($ghRes->getStatusCode() === 200) {
                    $ghData = json_decode($ghRes->getBody()->getContents(), true);
                    $assets = $ghData['assets'] ?? [];
                    foreach ($assets as $asset) {
                        $assetName = $asset['name'] ?? '';
                        if (str_ends_with(strtolower($assetName), '.jar')) {
                            if (!str_contains(strtolower($assetName), 'javadoc') && !str_contains(strtolower($assetName), 'sources')) {
                                $resolvedJarUrl = $asset['browser_download_url'] ?? null;
                                $resolvedJarName = $assetName;
                                break;
                            }
                        }
                    }
                }
            } catch (Throwable $e) {}

            // Attempt B: If GitHub API failed (e.g. rate limit), scrape release HTML page directly
            if (empty($resolvedJarUrl)) {
                try {
                    $htmlRes = $this->httpClient->get("https://github.com/{$ghOwner}/{$ghRepo}/releases/tag/{$ghTag}", [
                        'headers' => [
                            'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept' => 'text/html,application/xhtml+xml',
                        ],
                        'timeout' => 8,
                    ]);
                    if ($htmlRes->getStatusCode() === 200) {
                        $html = $htmlRes->getBody()->getContents();
                        if (preg_match('{href="(/'.preg_quote($ghOwner, '{').'/'.preg_quote($ghRepo, '{').'/releases/download/[^"]+?\.jar)"}i', $html, $assetMatch)) {
                            $resolvedJarUrl = "https://github.com" . $assetMatch[1];
                            $resolvedJarName = basename($assetMatch[1]);
                        }
                    }
                } catch (Throwable $e) {}
            }

            if (!empty($resolvedJarUrl)) {
                $url = $resolvedJarUrl;
                if (!empty($resolvedJarName)) {
                    $filename = $resolvedJarName;
                }
            }
        }

        // Validate URL
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['error' => 'Invalid file download URL.'], 400);
        }

        $parsedUrl = parse_url($url);
        if (!in_array(strtolower($parsedUrl['scheme'] ?? ''), ['http', 'https'], true)) {
            return response()->json(['error' => 'Only HTTP and HTTPS download URLs are permitted.'], 400);
        }

        $host = strtolower($parsedUrl['host'] ?? '');
        if (empty($host)) {
            return response()->json(['error' => 'Invalid download host in URL.'], 400);
        }

        // SSRF protection: reject local, loopback, link-local, and cloud metadata endpoints
        $blockedHosts = [
            'localhost',
            '127.0.0.1',
            '::1',
            '0.0.0.0',
            '169.254.169.254',
            'metadata.google.internal',
            'instance-data',
        ];
        if (in_array($host, $blockedHosts, true)) {
            return response()->json(['error' => 'Access to internal or private hosts is prohibited.'], 403);
        }

        $resolvedIp = gethostbyname($host);
        if ($resolvedIp !== $host) {
            if (!filter_var($resolvedIp, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return response()->json(['error' => "Resolved IP address for {$host} is in a reserved or private network range."], 403);
            }
        }

        // 3. Validate and Sanitize Filename with Spigot Proper Name Support
        $filename = trim((string) urldecode($filename));

        // If filename is missing, generic, or a Spigot numeric/temp placeholder, use cleaned title
        if (
            empty($filename) ||
            preg_match('/^(plugin|download|file|spigot-\d+[\w\.\-]*|\d+)\.(jar|zip)$/i', $filename)
        ) {
            if (!empty($pluginTitle)) {
                $cleanName = $this->cleanPluginName($pluginTitle);
                $filename = "{$cleanName}.jar";
            } else {
                $urlPath = parse_url($url, PHP_URL_PATH) ?? '';
                $urlBasename = basename($urlPath);
                if (!empty($urlBasename) && !preg_match('/^\d+\.(jar|zip)$/i', $urlBasename)) {
                    $filename = $urlBasename;
                }
            }
        }

        // Remove path traversal characters, directory separators, and null bytes
        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));
        $cleanFilename = trim($cleanFilename);

        // Sanitize characters: allow alphanumeric, spaces, hyphens, underscores, dots, plus, brackets, parentheses, commas
        $cleanFilename = preg_replace('/[^a-zA-Z0-9_\-\.\+\s\(\)\[\],]/', '_', $cleanFilename);
        $cleanFilename = preg_replace('/\s+/', ' ', $cleanFilename);
        $cleanFilename = preg_replace('/\.{2,}/', '.', $cleanFilename);
        $cleanFilename = trim($cleanFilename, " .");

        // Ensure file ends with .jar or .zip
        if (!preg_match('/\.(jar|zip)$/i', $cleanFilename)) {
            $cleanFilename .= '.jar';
        }

        if (empty($cleanFilename) || $cleanFilename === '.jar' || $cleanFilename === '.zip') {
            $cleanFilename = !empty($pluginTitle) ? ($this->cleanPluginName($pluginTitle) . '.jar') : 'plugin.jar';
        }

        if (
            str_contains($cleanFilename, '/') ||
            str_contains($cleanFilename, '\\') ||
            str_contains($cleanFilename, '..') ||
            !preg_match('/\.(jar|zip)$/i', $cleanFilename)
        ) {
            return response()->json(['error' => 'Invalid plugin filename. Filename must end with .jar or .zip and contain no path characters.'], 400);
        }

        try {
            // 4. Ensure the /plugins directory exists
            try {
                $this->fileRepository->setServer($server)->createDirectory('plugins', '/');
            } catch (Throwable $e) {}

            $installedSuccessfully = false;
            $downloadError = null;

            // Strategy A: Wings direct pull (foreground => false avoids gateway timeouts)
            try {
                $this->fileRepository->setServer($server)->pull(
                    $url,
                    '/plugins',
                    [
                        'filename' => $cleanFilename,
                        'use_header' => false,
                        'foreground' => false,
                    ]
                );
                $installedSuccessfully = true;
            } catch (Throwable $wingsErr) {
                $installedSuccessfully = false;
                $downloadError = $wingsErr->getMessage();
            }

            // Strategy B: If Wings daemon pull failed (e.g. Cloudflare block on Wings daemon, daemon timeout, or connectivity),
            // Panel downloads using verified User-Agent and streams directly to server container via putContent
            if (!$installedSuccessfully) {
                try {
                    $dlRes = $this->httpClient->get($url, [
                        'headers' => [
                            'User-Agent' => self::USER_AGENT,
                            'Accept' => '*/*',
                        ],
                        'allow_redirects' => [
                            'max' => 10,
                            'strict' => false,
                            'referer' => true,
                        ],
                        'timeout' => 60,
                    ]);

                    if ($dlRes->getStatusCode() === 200) {
                        $contents = $dlRes->getBody()->getContents();
                        if (!empty($contents)) {
                            // Check if remote server supplied a proper Content-Disposition filename
                            $disp = $dlRes->getHeaderLine('Content-Disposition');
                            if (!empty($disp) && preg_match('/filename\*?=(?:UTF-8\'\')?["\']?([^";\r\n]+)["\']?/i', $disp, $dispMatch)) {
                                $dispFilename = trim(urldecode($dispMatch[1]));
                                if (preg_match('/\.jar$/i', $dispFilename) && !preg_match('/^\d+\.jar$/i', $dispFilename)) {
                                    $sanitizedDisp = basename(str_replace(['\\', '/', "\0"], '', $dispFilename));
                                    $sanitizedDisp = preg_replace('/[^a-zA-Z0-9_\-\.\+\s\(\)\[\],]/', '_', $sanitizedDisp);
                                    if (!empty($sanitizedDisp) && preg_match('/\.jar$/i', $sanitizedDisp)) {
                                        $cleanFilename = $sanitizedDisp;
                                    }
                                }
                            }

                            $this->fileRepository->setServer($server)->putContent("/plugins/{$cleanFilename}", $contents);
                            $installedSuccessfully = true;
                        }
                    }
                } catch (Throwable $uploadEx) {
                    $downloadError = $uploadEx->getMessage();
                }
            }

            if (!$installedSuccessfully) {
                return response()->json([
                    'success' => false,
                    'errors' => [
                        ['code' => 'InstallFailed', 'detail' => 'Could not download plugin file from remote host to server container' . (!empty($downloadError) ? ': ' . $downloadError : '.')]
                    ],
                    'message' => 'Could not download plugin file from remote host to server container' . (!empty($downloadError) ? ': ' . $downloadError : '.'),
                ], 502);
            }

            // 5. Always record metadata in /plugins/.plugins_meta.json
            if (!empty($iconUrl) && filter_var($iconUrl, FILTER_VALIDATE_URL)) {
                Cache::put('ptero_plugin_icon_' . md5(strtolower($cleanFilename)), $iconUrl, 604800);
            }

            try {
                $meta = [];
                try {
                    $metaContent = $this->fileRepository->setServer($server)->getContent('/plugins/.plugins_meta.json');
                    $meta = json_decode($metaContent, true) ?: [];
                } catch (Throwable $e) {}

                $meta[$cleanFilename] = [
                    'icon_url' => $iconUrl ?: ($meta[$cleanFilename]['icon_url'] ?? null),
                    'title' => !empty($pluginTitle) ? $pluginTitle : ($meta[$cleanFilename]['title'] ?? $cleanFilename),
                    'plugin_id' => !empty($pluginId) ? $pluginId : ($meta[$cleanFilename]['plugin_id'] ?? null),
                    'slug' => !empty($slug) ? $slug : ($meta[$cleanFilename]['slug'] ?? null),
                    'provider' => !empty($provider) ? $provider : ($meta[$cleanFilename]['provider'] ?? null),
                    'installed_at' => date('c'),
                ];
                $this->fileRepository->setServer($server)->putContent('/plugins/.plugins_meta.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            } catch (Throwable $e) {}

            return response()->json([
                'success' => true,
                'message' => "Plugin {$cleanFilename} installed successfully into /plugins.",
                'filename' => $cleanFilename,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'errors' => [
                    ['code' => 'InstallException', 'detail' => 'Failed to install plugin: ' . $e->getMessage()]
                ],
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

            $meta = [];
            try {
                $content = $this->fileRepository->setServer($server)->getContent('/plugins/.plugins_meta.json');
                $meta = json_decode($content, true) ?: [];
            } catch (Throwable $e) {}

            if (is_array($items)) {
                foreach ($items as $item) {
                    $name = $item['name'] ?? '';
                    $isFile = !empty($item['file']) || !empty($item['is_file']) || (isset($item['directory']) && !$item['directory']) || (isset($item['is_directory']) && !$item['is_directory']);
                    if ($isFile && preg_match('/\.(jar|zip)$/i', $name)) {
                        $metaItem = $meta[$name] ?? [];
                        $files[] = [
                            'name' => $name,
                            'size' => (int) ($item['size'] ?? 0),
                            'modified_at' => $item['modified_at'] ?? $item['modifiedAt'] ?? '',
                            'icon_url' => $metaItem['icon_url'] ?? null,
                            'title' => $metaItem['title'] ?? null,
                            'plugin_id' => $metaItem['plugin_id'] ?? null,
                            'slug' => $metaItem['slug'] ?? null,
                            'provider' => $metaItem['provider'] ?? null,
                        ];
                    }
                }
            }

            if (!empty($files)) {
                $files = $this->enrichPluginIcons($server, $files, $meta);
            }

            return response()->json($files);
        } catch (Exception $e) {
            return response()->json([]);
        }
    }

    /**
     * Enrich installed plugin file items with their icons.
     */
    protected function enrichPluginIcons(Server $server, array $files, array $meta = []): array
    {
        if (empty($meta)) {
            try {
                $content = $this->fileRepository->setServer($server)->getContent('/plugins/.plugins_meta.json');
                $meta = json_decode($content, true) ?: [];
            } catch (Throwable $e) {}
        }

        $toQuery = [];
        foreach ($files as $idx => &$file) {
            $name = $file['name'];
            $cleanName = strtolower(trim($name));
            $file['icon_url'] = null;

            // 1. Check .plugins_meta.json
            if (!empty($meta[$name]['icon_url'])) {
                $file['icon_url'] = $meta[$name]['icon_url'];
                continue;
            }

            // 2. Check Laravel Cache
            $cacheKey = 'ptero_plugin_icon_' . md5($cleanName);
            if (Cache::has($cacheKey)) {
                $cached = Cache::get($cacheKey);
                $file['icon_url'] = !empty($cached) ? $cached : null;
                continue;
            }

            // 3. Mark for external query from Modrinth
            $cleanQuery = preg_replace('/\.(jar|zip)$/i', '', $name);
            $cleanQuery = preg_replace('/\s*\(\d+\)$/', '', $cleanQuery);
            $cleanQuery = preg_replace('/[-_]v?\d+(\.\d+).*$/i', '', $cleanQuery);
            $cleanQuery = preg_replace('/[-_](velocity|paper|spigot|purpur|bungee|bukkit|fabric|forge)$/i', '', $cleanQuery);
            $cleanQuery = trim($cleanQuery, " \t\n\r\0\x0B-_");

            if (!empty($cleanQuery)) {
                $toQuery[$idx] = [
                    'clean_name' => $cleanName,
                    'query' => $cleanQuery,
                ];
            }
        }
        unset($file);

        // Fetch missing icons concurrently from Modrinth
        if (!empty($toQuery)) {
            $promises = [];
            foreach ($toQuery as $idx => $info) {
                $promises[$idx] = $this->httpClient->getAsync(
                    self::MODRINTH_API . 'search',
                    [
                        'query' => [
                            'query' => $info['query'],
                            'limit' => 1,
                        ],
                        'timeout' => 4.0,
                    ]
                );
            }

            try {
                $results = Utils::settle($promises)->wait();
                foreach ($results as $idx => $res) {
                    $cleanName = $toQuery[$idx]['clean_name'];
                    $cacheKey = 'ptero_plugin_icon_' . md5($cleanName);
                    $iconUrl = null;

                    if ($res['state'] === 'fulfilled' && $res['value']->getStatusCode() === 200) {
                        $body = json_decode($res['value']->getBody()->getContents(), true);
                        $hits = $body['hits'] ?? [];
                        if (!empty($hits[0]['icon_url'])) {
                            $hit = $hits[0];
                            $slug = strtolower($hit['slug'] ?? '');
                            $title = strtolower(preg_replace('/[^a-z0-9]/', '', $hit['title'] ?? ''));
                            $qNorm = strtolower(preg_replace('/[^a-z0-9]/', '', $toQuery[$idx]['query']));

                            if (
                                str_contains($title, $qNorm) ||
                                str_contains($qNorm, $title) ||
                                str_contains($slug, $qNorm) ||
                                str_contains($qNorm, $slug)
                            ) {
                                $iconUrl = $hit['icon_url'];
                            }
                        }
                    }

                    if (!empty($iconUrl)) {
                        $files[$idx]['icon_url'] = $iconUrl;
                        Cache::put($cacheKey, $iconUrl, 604800); // Cache for 7 days
                    } else {
                        $files[$idx]['icon_url'] = null;
                        Cache::put($cacheKey, '', 86400); // Negative cache 24h
                    }
                }
            } catch (Throwable $e) {}
        }

        return $files;
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
        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', urldecode($filename)));
        $cleanFilename = trim($cleanFilename);

        if (
            empty($cleanFilename) ||
            $cleanFilename === '.' ||
            $cleanFilename === '..' ||
            str_contains($cleanFilename, '/') ||
            str_contains($cleanFilename, '\\') ||
            str_contains($cleanFilename, '..') ||
            !preg_match('/\.(jar|zip)$/i', $cleanFilename)
        ) {
            return response()->json(['error' => 'Invalid plugin filename to delete.'], 400);
        }

        try {
            $this->fileRepository->setServer($server)->deleteFiles('/plugins', [$cleanFilename]);

            // Remove from .plugins_meta.json if present
            try {
                $metaContent = $this->fileRepository->setServer($server)->getContent('/plugins/.plugins_meta.json');
                $meta = json_decode($metaContent, true) ?: [];
                if (isset($meta[$cleanFilename])) {
                    unset($meta[$cleanFilename]);
                    $this->fileRepository->setServer($server)->putContent('/plugins/.plugins_meta.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
                }
            } catch (Throwable $e) {}

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
