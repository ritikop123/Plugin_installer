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

class PluginInstallerController extends ClientApiController
{
    private const MODRINTH_API = 'https://api.modrinth.com/v2/';
    private const USER_AGENT = 'Arix-Plugin-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)';

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
     * Search plugins from public Modrinth API.
     * GET /api/client/servers/{server}/plugins
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

        // Filter server loaders
        if ($loader !== 'all' && !empty($loader)) {
            $facets[] = ["categories:{$loader}"];
        } else {
            $facets[] = [
                'categories:spigot',
                'categories:paper',
                'categories:purpur',
                'categories:velocity',
                'categories:bungeecord',
                'categories:folia',
                'categories:fabric',
            ];
        }

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
     * Get versions for a specific plugin.
     * GET /api/client/servers/{server}/plugins/versions?plugin=<project_id>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $pluginId = $request->query('plugin', '');
        if (empty($pluginId) || !preg_match('/^[a-zA-Z0-9_\-]+$/', $pluginId)) {
            return response()->json(['error' => 'Valid plugin ID or slug is required.'], 400);
        }

        try {
            $response = $this->httpClient->get("project/{$pluginId}/version");
            $statusCode = $response->getStatusCode();

            if ($statusCode >= 400) {
                return response()->json(['error' => 'Failed to retrieve plugin versions from Modrinth.'], 502);
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
     * GET /api/client/servers/{server}/plugins/tags
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
                    // Filter to release Minecraft versions
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

        // 1. Validate URL: strictly require HTTPS and valid Modrinth CDN domain to prevent SSRF
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

        // 2. Validate Filename: prevent path traversal (no slashes, no dots traversal, valid characters)
        if (empty($filename)) {
            return response()->json(['error' => 'Filename is required.'], 400);
        }

        // Sanitize: remove any directory paths that may have been supplied
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
            // 3. Ensure the /plugins directory exists in the container
            try {
                $this->fileRepository->setServer($server)->createDirectory('plugins', '/');
            } catch (Exception $e) {
                // Folder already exists or was already prepared, continue
            }

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
