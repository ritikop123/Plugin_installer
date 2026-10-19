<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Illuminate\Support\Facades\Cache;
use GuzzleHttp\Promise\Utils;

class ModInstallerController extends ClientApiController
{
    private const MODRINTH_API = 'https://api.modrinth.com/v2/';
    private const CURSE_API = 'https://api.curse.tools/v1/cf/';
    private const USER_AGENT = 'Arix-Mod-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)';

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
     * Search mods from Modrinth or CurseForge.
     * GET /api/client/servers/{server}/mods
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

        if ($provider === 'curseforge' || $provider === 'curse') {
            return $this->searchCurseForgeMods($query, $loader, $gameVersion, $page, $limit);
        }

        return $this->searchModrinthMods($query, $loader, $gameVersion, $sortBy, $page, $limit);
    }

    protected function searchModrinthMods(string $query, string $loader, string $gameVersion, string $sortBy, int $page, int $limit): JsonResponse
    {
        $offset = ($page - 1) * $limit;
        $facets = [];
        $facets[] = ['project_type:mod'];

        if ($loader !== 'all' && !empty($loader)) {
            $facets[] = ["categories:{$loader}"];
        } else {
            $facets[] = [
                'categories:fabric',
                'categories:forge',
                'categories:neoforge',
                'categories:quilt',
            ];
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

    protected function searchCurseForgeMods(string $query, string $loader, string $gameVersion, int $page, int $limit): JsonResponse
    {
        try {
            $offset = ($page - 1) * $limit;
            $params = [
                'gameId' => 432,
                'classId' => 6, // Minecraft Mods
                'index' => $offset,
                'pageSize' => $limit,
                'sortField' => 2, // Popularity
                'sortOrder' => 'desc',
            ];

            if (!empty($query)) {
                $params['searchFilter'] = $query;
            }
            if (!empty($gameVersion) && $gameVersion !== 'all') {
                $params['gameVersion'] = $gameVersion;
            }
            if (!empty($loader) && $loader !== 'all') {
                $loaderMap = ['forge' => 1, 'cauldron' => 2, 'liteloader' => 3, 'fabric' => 4, 'quilt' => 5, 'neoforge' => 6];
                if (isset($loaderMap[$loader])) {
                    $params['modLoaderType'] = $loaderMap[$loader];
                }
            }

            $response = $this->httpClient->get(self::CURSE_API . 'mods/search', ['query' => $params]);
            $raw = json_decode($response->getBody()->getContents(), true);
            $items = $raw['data'] ?? [];
            $total = $raw['pagination']['totalCount'] ?? count($items);
            $hits = [];

            foreach ($items as $item) {
                $hits[] = [
                    'project_id' => (string) $item['id'],
                    'id' => (string) $item['id'],
                    'slug' => $item['slug'] ?? (string) $item['id'],
                    'title' => $item['name'] ?? 'Minecraft Mod',
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
     * Get versions for a specific mod.
     * GET /api/client/servers/{server}/mods/versions?mod=<project_id>&provider=<provider>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $modId = trim((string) $request->query('mod', $request->query('plugin', '')));
        $provider = strtolower(trim((string) $request->query('provider', 'modrinth')));

        if (empty($modId)) {
            return response()->json(['error' => 'Valid mod ID or slug is required.'], 400);
        }

        if ($provider === 'curseforge' || $provider === 'curse') {
            try {
                $response = $this->httpClient->get(self::CURSE_API . "mods/{$modId}/files", [
                    'query' => ['pageSize' => 20],
                ]);
                $raw = json_decode($response->getBody()->getContents(), true);
                $items = $raw['data'] ?? [];
                $versions = [];

                foreach ($items as $f) {
                    $downloadUrl = $f['downloadUrl'] ?? null;
                    $fileId = (string) $f['id'];
                    $fileName = $f['fileName'] ?? "mod-{$fileId}.jar";

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
                        'loaders' => ['forge', 'fabric', 'neoforge', 'quilt'],
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

        try {
            $response = $this->httpClient->get(self::MODRINTH_API . "project/{$modId}/version");
            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json(is_array($data) ? $data : []);
        } catch (Throwable $e) {
            return response()->json(['error' => 'Modrinth API error: ' . $e->getMessage()], 502);
        }
    }

    /**
     * Get dynamic Minecraft game version tags from Modrinth.
     * GET /api/client/servers/{server}/mods/tags
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
     * List all installed mod files from /mods.
     * GET /api/client/servers/{server}/mods/installed
     */
    public function installed(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory('/mods');
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
            if (!empty($files)) {
                $files = $this->enrichModIcons($server, $files);
            }

            return response()->json($files);
        } catch (Exception $e) {
            return response()->json([]);
        }
    }

    /**
     * Install mod file into the server container's /mods directory.
     * POST /api/client/servers/{server}/mods/install
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $url = (string) $request->input('url', '');
        $filename = (string) $request->input('filename', '');

        // 1. If URL points to a GitHub release tag page, resolve the direct .jar release asset
        if (preg_match('#github\.com/([^/]+)/([^/]+)/releases/tag/([^/?#]+)#i', $url, $m)) {
            try {
                $ghApi = "https://api.github.com/repos/{$m[1]}/{$m[2]}/releases/tags/{$m[3]}";
                $ghRes = $this->httpClient->get($ghApi, [
                    'headers' => [
                        'User-Agent' => self::USER_AGENT,
                        'Accept' => 'application/vnd.github.v3+json',
                    ],
                    'timeout' => 8,
                ]);
                if ($ghRes->getStatusCode() === 200) {
                    $ghData = json_decode($ghRes->getBody()->getContents(), true);
                    $assets = $ghData['assets'] ?? [];
                    $jarAsset = null;
                    foreach ($assets as $asset) {
                        $assetName = $asset['name'] ?? '';
                        if (str_ends_with(strtolower($assetName), '.jar')) {
                            if (!str_contains(strtolower($assetName), 'javadoc') && !str_contains(strtolower($assetName), 'sources')) {
                                $jarAsset = $asset;
                                break;
                            }
                        }
                    }
                    if ($jarAsset && !empty($jarAsset['browser_download_url'])) {
                        $url = $jarAsset['browser_download_url'];
                        if (empty($filename) || $filename === 'mod.jar') {
                            $filename = $jarAsset['name'];
                        }
                    }
                }
            } catch (Throwable $e) {}
        }

        // Validate URL
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['error' => 'Invalid file download URL.'], 400);
        }

        $parsedUrl = parse_url($url);
        if (($parsedUrl['scheme'] ?? '') !== 'https') {
            return response()->json(['error' => 'Only secure HTTPS download URLs are permitted.'], 400);
        }

        $host = strtolower($parsedUrl['host'] ?? '');
        $allowedSuffixes = [
            'modrinth.com',
            'forgecdn.net',
            'curseforge.com',
            'curse.tools',
            'github.com',
            'githubusercontent.com',
            'amazonaws.com',
            'gitlab.com',
            'codeberg.org',
            'jsdelivr.net',
            'creeper.host',
        ];

        $isAllowedHost = false;
        foreach ($allowedSuffixes as $suffix) {
            if ($host === $suffix || str_ends_with($host, '.' . $suffix)) {
                $isAllowedHost = true;
                break;
            }
        }

        if (!$isAllowedHost) {
            return response()->json(['error' => "Untrusted download host ({$host}). Only verified mod CDN URLs are allowed."], 400);
        }

        // 2. Validate and Sanitize Filename
        $filename = trim((string) urldecode($filename));
        if (empty($filename)) {
            $urlPath = parse_url($url, PHP_URL_PATH) ?? '';
            $filename = basename($urlPath);
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
            $cleanFilename = 'mod.jar';
        }

        if (
            str_contains($cleanFilename, '/') ||
            str_contains($cleanFilename, '\\') ||
            str_contains($cleanFilename, '..') ||
            !preg_match('/\.(jar|zip)$/i', $cleanFilename)
        ) {
            return response()->json(['error' => 'Invalid mod filename. Filename must end with .jar or .zip and contain no path characters.'], 400);
        }

        try {
            // 3. Ensure the /mods directory exists
            try {
                $this->fileRepository->setServer($server)->createDirectory('mods', '/');
            } catch (Exception $e) {}

            // 4. Pull directly into /mods
            // use_header => false guarantees Wings strictly saves the file with $cleanFilename (.jar)
            $this->fileRepository->setServer($server)->pull(
                $url,
                '/mods',
                [
                    'filename' => $cleanFilename,
                    'use_header' => false,
                    'foreground' => true,
                ]
            );

            // 4b. Auto-install required dependencies if provided
            $installDeps = (bool) $request->input('install_dependencies', true);
            $deps = $request->input('dependencies', []);
            $installedDeps = [];

            if ($installDeps && is_array($deps) && !empty($deps)) {
                foreach ($deps as $dep) {
                    if (($dep['dependency_type'] ?? '') !== 'required') {
                        continue;
                    }
                    $depProjId = $dep['project_id'] ?? null;
                    $depVerId = $dep['version_id'] ?? null;
                    if (!$depProjId && !$depVerId) {
                        continue;
                    }

                    try {
                        $depUrl = null;
                        $depFilename = null;
                        if ($depVerId) {
                            $dRes = $this->httpClient->get(self::MODRINTH_API . "version/{$depVerId}", ['timeout' => 6]);
                            if ($dRes->getStatusCode() === 200) {
                                $dData = json_decode($dRes->getBody()->getContents(), true);
                                $f = $dData['files'][0] ?? null;
                                if ($f) {
                                    $depUrl = $f['url'] ?? null;
                                    $depFilename = $f['filename'] ?? null;
                                }
                            }
                        } elseif ($depProjId) {
                            $dRes = $this->httpClient->get(self::MODRINTH_API . "project/{$depProjId}/version", ['timeout' => 6]);
                            if ($dRes->getStatusCode() === 200) {
                                $dData = json_decode($dRes->getBody()->getContents(), true);
                                if (!empty($dData[0]['files'][0]['url'])) {
                                    $depUrl = $dData[0]['files'][0]['url'];
                                    $depFilename = $dData[0]['files'][0]['filename'] ?? null;
                                }
                            }
                        }

                        if ($depUrl && filter_var($depUrl, FILTER_VALIDATE_URL)) {
                            $cleanDepFn = basename(str_replace(['\\', '/', "\0"], '', $depFilename ?: 'dependency.jar'));
                            $cleanDepFn = preg_replace('/[^a-zA-Z0-9_\-\.\+\s\(\)\[\],]/', '_', $cleanDepFn);
                            if (!preg_match('/\.(jar|zip)$/i', $cleanDepFn)) {
                                $cleanDepFn .= '.jar';
                            }
                            $this->fileRepository->setServer($server)->pull(
                                $depUrl,
                                '/mods',
                                [
                                    'filename' => $cleanDepFn,
                                    'use_header' => false,
                                    'foreground' => true,
                                ]
                            );
                            $installedDeps[] = $cleanDepFn;
                        }
                    } catch (Throwable $e) {}
                }
            }

            // 5. Cache icon if provided and update /mods/.mods_meta.json
            $iconUrl = (string) $request->input('icon_url', '');
            $modTitle = (string) $request->input('title', $cleanFilename);
            if (!empty($iconUrl) && filter_var($iconUrl, FILTER_VALIDATE_URL)) {
                Cache::put('ptero_mod_icon_' . md5(strtolower($cleanFilename)), $iconUrl, 604800);
                try {
                    $meta = [];
                    try {
                        $metaContent = $this->fileRepository->setServer($server)->getContent('/mods/.mods_meta.json');
                        $meta = json_decode($metaContent, true) ?: [];
                    } catch (Throwable $e) {}
                    $meta[$cleanFilename] = [
                        'icon_url' => $iconUrl,
                        'title' => $modTitle,
                        'installed_at' => date('c'),
                    ];
                    $this->fileRepository->setServer($server)->putContent('/mods/.mods_meta.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
                } catch (Throwable $e) {}
            }

            return response()->json([
                'success' => true,
                'message' => "Mod {$cleanFilename} installed successfully into /mods.",
                'filename' => $cleanFilename,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to install mod to server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Enrich installed mod file items with their icons.
     */
    protected function enrichModIcons(Server $server, array $files): array
    {
        $meta = [];
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/mods/.mods_meta.json');
            $meta = json_decode($content, true) ?: [];
        } catch (Throwable $e) {}

        $toQuery = [];
        foreach ($files as $idx => &$file) {
            $name = $file['name'];
            $cleanName = strtolower(trim($name));
            $file['icon_url'] = null;

            // 1. Check .mods_meta.json
            if (!empty($meta[$name]['icon_url'])) {
                $file['icon_url'] = $meta[$name]['icon_url'];
                continue;
            }

            // 2. Check Laravel Cache
            $cacheKey = 'ptero_mod_icon_' . md5($cleanName);
            if (Cache::has($cacheKey)) {
                $cached = Cache::get($cacheKey);
                $file['icon_url'] = !empty($cached) ? $cached : null;
                continue;
            }

            // 3. Mark for external query from Modrinth
            $cleanQuery = preg_replace('/\.(jar|zip)$/i', '', $name);
            $cleanQuery = preg_replace('/\s*\(\d+\)$/', '', $cleanQuery);
            $cleanQuery = preg_replace('/[-_]v?\d+(\.\d+).*$/i', '', $cleanQuery);
            $cleanQuery = preg_replace('/[-_](fabric|forge|neoforge|quilt)$/i', '', $cleanQuery);
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
                    $cacheKey = 'ptero_mod_icon_' . md5($cleanName);
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
     * Delete an installed mod file from /mods.
     * POST /api/client/servers/{server}/mods/delete
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
            return response()->json(['error' => 'Invalid mod filename to delete.'], 400);
        }

        try {
            $this->fileRepository->setServer($server)->deleteFiles('/mods', [$cleanFilename]);

            // Remove from .mods_meta.json if present
            try {
                $metaContent = $this->fileRepository->setServer($server)->getContent('/mods/.mods_meta.json');
                $meta = json_decode($metaContent, true) ?: [];
                if (isset($meta[$cleanFilename])) {
                    unset($meta[$cleanFilename]);
                    $this->fileRepository->setServer($server)->putContent('/mods/.mods_meta.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
                }
            } catch (Throwable $e) {}

            return response()->json([
                'success' => true,
                'message' => "Mod {$cleanFilename} uninstalled successfully.",
                'filename' => $cleanFilename,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to delete mod file from server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
