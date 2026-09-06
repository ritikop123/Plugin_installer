<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use GuzzleHttp\Client;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class PluginInstallerController extends ClientApiController
{
    private const MODRINTH_API = 'https://api.modrinth.com/v2';
    private const USER_AGENT = 'Arix-Theme-PluginInstaller/1.0.0 (pterodactyl-addon@arix.gg)';

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
        ]);
    }

    /**
     * Search plugins on Modrinth API.
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
        $page = (int) $request->query('page', 1);
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
            'index' => $sortBy,
        ];

        if (!empty($facets)) {
            $params['facets'] = json_encode($facets);
        }

        try {
            $response = $this->httpClient->get('search', [
                'query' => $params,
            ]);

            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json($data);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch plugins from Modrinth',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Fetch all versions of a plugin from Modrinth.
     * GET /api/client/servers/{server}/plugins/versions?plugin={id_or_slug}
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $pluginId = $request->query('plugin', '');
        if (empty($pluginId)) {
            return response()->json(['error' => 'Plugin ID is required'], 400);
        }

        try {
            $response = $this->httpClient->get("project/{$pluginId}/version");
            $data = json_decode($response->getBody()->getContents(), true);

            return response()->json($data);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to fetch plugin versions',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Installs a plugin directly to the server's /plugins directory.
     * Auto-creates the /plugins directory in the container if missing!
     * POST /api/client/servers/{server}/plugins/install
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $fileUrl = $request->input('url');
        $filename = $request->input('filename');

        if (empty($fileUrl) || empty($filename)) {
            return response()->json(['error' => 'File URL and filename are required'], 400);
        }

        try {
            // Step 1: Ensure /plugins directory exists in the container
            try {
                $this->fileRepository->setServer($server)->createDirectory('plugins', '/');
            } catch (Exception $e) {
                // Folder already exists or wings created it, continue
            }

            // Step 2: Command Wings daemon to pull the file directly into /plugins
            $this->fileRepository->setServer($server)->pull(
                $fileUrl,
                '/plugins',
                [
                    'use_header' => true,
                    'foreground' => true,
                ]
            );

            return response()->json([
                'success' => true,
                'message' => "Plugin {$filename} installed successfully into /plugins folder.",
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to install plugin to server',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
