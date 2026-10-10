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

        // 1. Validate URL
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
            return response()->json(['error' => "Untrusted download host ({$host}). Only verified mod CDN URLs are allowed."], 400);
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
            return response()->json(['error' => 'Invalid mod filename. Filename must end with .jar or .zip and contain no path characters.'], 400);
        }

        try {
            // 3. Ensure the /mods directory exists
            try {
                $this->fileRepository->setServer($server)->createDirectory('mods', '/');
            } catch (Exception $e) {}

            // 4. Pull directly into /mods
            $this->fileRepository->setServer($server)->pull(
                $url,
                '/mods',
                [
                    'filename' => $cleanFilename,
                    'use_header' => true,
                    'foreground' => true,
                ]
            );

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
     * Delete an installed mod file from /mods.
     * POST /api/client/servers/{server}/mods/delete
     */
    public function delete(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $filename = (string) $request->input('filename', '');
        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));

        if (empty($cleanFilename) || !preg_match('/\.(jar|zip)$/i', $cleanFilename)) {
            return response()->json(['error' => 'Invalid mod filename to delete.'], 400);
        }

        try {
            $this->fileRepository->setServer($server)->deleteFiles('/mods', [$cleanFilename]);
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
