<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
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
    private const USER_AGENT = 'Arix-Mod-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)';

    protected Client $httpClient;
    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->httpClient = new Client([
            'base_uri' => self::MODRINTH_API,
            'headers' => [
                'User-Agent' => self::USER_AGENT,
                'Accept' => 'application/json',
            ],
            'timeout' => 15.0,
            'http_errors' => false,
        ]);
    }

    /**
     * Search mods from public Modrinth API.
     * GET /api/client/servers/{server}/mods
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $query = $request->query('query', '');
        $loader = $request->query('loader', 'all');
        $gameVersion = $request->query('game_version', 'all');
        $sortBy = $request->query('sort_by', 'downloads');
        $page = max(1, (int) $request->query('page', 1));
        $limit = 21;
        $offset = ($page - 1) * $limit;

        $facets = [];

        // 1. Must be a mod
        $facets[] = ['project_type:mod'];

        // 2. Filter mod loaders (Fabric, Forge, NeoForge, Quilt)
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

        // 3. Filter Minecraft game version
        if ($gameVersion !== 'all' && !empty($gameVersion)) {
            $facets[] = ["versions:{$gameVersion}"];
        }

        $params = [
            'query' => trim($query),
            'limit' => $limit,
            'offset' => $offset,
            'index' => in_array($sortBy, ['downloads', 'relevance', 'updated', 'newest']) ? $sortBy : 'downloads',
        ];

        if (!empty($facets)) {
            $params['facets'] = json_encode($facets);
        }

        try {
            $response = $this->httpClient->get('search', [
                'query' => $params,
            ]);

            $statusCode = $response->getStatusCode();
            if ($statusCode >= 400) {
                return response()->json([
                    'error' => 'Modrinth API error',
                    'status' => $statusCode,
                ], 502);
            }

            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json($data ?: ['hits' => [], 'total_hits' => 0]);
        } catch (GuzzleException $e) {
            return response()->json([
                'error' => 'Failed to connect to Modrinth API',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get versions for a specific mod.
     * GET /api/client/servers/{server}/mods/versions?mod=<project_id>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $modId = $request->query('mod', $request->query('plugin', ''));
        if (empty($modId) || !preg_match('/^[a-zA-Z0-9_\-]+$/', $modId)) {
            return response()->json(['error' => 'Valid mod ID or slug is required.'], 400);
        }

        try {
            $response = $this->httpClient->get("project/{$modId}/version");
            $statusCode = $response->getStatusCode();

            if ($statusCode >= 400) {
                return response()->json(['error' => 'Failed to retrieve mod versions from Modrinth.'], 502);
            }

            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json(is_array($data) ? $data : []);
        } catch (GuzzleException $e) {
            return response()->json([
                'error' => 'Failed to connect to Modrinth API',
                'message' => $e->getMessage(),
            ], 502);
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
            $response = $this->httpClient->get('tag/game_version');
            if ($response->getStatusCode() === 200) {
                $data = json_decode($response->getBody()->getContents(), true);
                if (is_array($data)) {
                    $releases = array_values(array_filter($data, function ($item) {
                        return isset($item['version_type']) && $item['version_type'] === 'release';
                    }));
                    return response()->json($releases);
                }
            }
        } catch (Exception $e) {
            // Ignore tag fetch failure and return empty list
        }

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

        // 1. Validate URL: HTTPS & Modrinth CDN only
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['error' => 'Invalid file download URL.'], 400);
        }

        $parsedUrl = parse_url($url);
        if (($parsedUrl['scheme'] ?? '') !== 'https') {
            return response()->json(['error' => 'Only secure HTTPS download URLs are permitted.'], 400);
        }

        $host = strtolower($parsedUrl['host'] ?? '');
        $allowedHosts = ['cdn.modrinth.com', 'api.modrinth.com'];
        $isAllowedHost = false;
        foreach ($allowedHosts as $allowed) {
            if ($host === $allowed || str_ends_with($host, '.' . $allowed)) {
                $isAllowedHost = true;
                break;
            }
        }

        if (!$isAllowedHost) {
            return response()->json(['error' => 'Untrusted download host. Only Modrinth CDN URLs are allowed.'], 400);
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
            // 3. Ensure the /mods directory exists in the container
            try {
                $this->fileRepository->setServer($server)->createDirectory('mods', '/');
            } catch (Exception $e) {
                // Folder already exists, continue
            }

            // 4. Command Wings to pull the file directly into /mods
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
