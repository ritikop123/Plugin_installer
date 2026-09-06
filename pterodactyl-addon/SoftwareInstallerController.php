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

class SoftwareInstallerController extends ClientApiController
{
    private const MCJARS_API = 'https://mcjars.app/api/v2/';
    private const USER_AGENT = 'Arix-Software-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)';

    protected Client $httpClient;
    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->httpClient = new Client([
            'base_uri' => self::MCJARS_API,
            'headers' => [
                'User-Agent' => self::USER_AGENT,
                'Accept' => 'application/json',
            ],
            'timeout' => 15.0,
            'http_errors' => false,
        ]);
    }

    /**
     * Get all Minecraft server software types.
     * GET /api/client/servers/{server}/software
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $response = $this->httpClient->get('types');
            if ($response->getStatusCode() !== 200) {
                return response()->json(['error' => 'Failed to fetch software types from MCJars API.'], 502);
            }

            $body = json_decode($response->getBody()->getContents(), true);
            $types = $body['types'] ?? [];

            $softwareList = [];
            foreach ($types as $category => $items) {
                if (is_array($items)) {
                    foreach ($items as $id => $item) {
                        $softwareList[] = array_merge(['id' => $id, 'category' => $category], $item);
                    }
                }
            }

            return response()->json([
                'success' => true,
                'software' => $softwareList,
            ]);
        } catch (GuzzleException $e) {
            return response()->json([
                'error' => 'Failed to connect to software catalog service.',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get all versions for a specific software type.
     * GET /api/client/servers/{server}/software/versions?type=<SOFTWARE_ID>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $type = strtoupper(trim($request->query('type', '')));
        if (empty($type) || !preg_match('/^[A-Z0-9_\-]+$/', $type)) {
            return response()->json(['error' => 'Valid software type is required (e.g., PAPER, PURPUR, FABRIC).'], 400);
        }

        try {
            $response = $this->httpClient->get("builds/{$type}");
            if ($response->getStatusCode() !== 200) {
                return response()->json(['error' => "Failed to fetch versions for {$type}."], 502);
            }

            $body = json_decode($response->getBody()->getContents(), true);
            $rawBuilds = $body['builds'] ?? [];

            $versionList = [];
            foreach ($rawBuilds as $ver => $data) {
                $versionList[] = [
                    'version' => (string) $ver,
                    'type' => $data['type'] ?? 'RELEASE',
                    'supported' => (bool) ($data['supported'] ?? true),
                    'java' => $data['java'] ?? null,
                    'builds' => (int) ($data['builds'] ?? 1),
                    'created' => $data['created'] ?? null,
                    'latest' => $data['latest'] ?? null,
                ];
            }

            // Sort versions descending (newer Minecraft versions first)
            usort($versionList, function ($a, $b) {
                return version_compare($b['version'], $a['version']);
            });

            return response()->json([
                'success' => true,
                'type' => $type,
                'versions' => $versionList,
            ]);
        } catch (GuzzleException $e) {
            return response()->json([
                'error' => 'Failed to connect to software version service.',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get specific builds for a version of a software.
     * GET /api/client/servers/{server}/software/builds?type=<SOFTWARE_ID>&version=<VERSION>
     */
    public function builds(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $type = strtoupper(trim($request->query('type', '')));
        $version = trim($request->query('version', ''));

        if (empty($type) || empty($version)) {
            return response()->json(['error' => 'Software type and version are required.'], 400);
        }

        try {
            $response = $this->httpClient->get("builds/{$type}/{$version}");
            if ($response->getStatusCode() !== 200) {
                return response()->json(['error' => "Failed to fetch builds for {$type} {$version}."], 502);
            }

            $body = json_decode($response->getBody()->getContents(), true);
            $builds = $body['builds'] ?? [];

            return response()->json([
                'success' => true,
                'type' => $type,
                'version' => $version,
                'builds' => is_array($builds) ? $builds : [],
            ]);
        } catch (GuzzleException $e) {
            return response()->json([
                'error' => 'Failed to connect to software build service.',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Install software jar onto server, with optional server file wipe.
     * POST /api/client/servers/{server}/software/install
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $url = (string) $request->input('url', '');
        $wipe = (bool) $request->input('wipe', false);
        $filename = (string) $request->input('filename', 'server.jar');

        // 1. Validate URL: require HTTPS
        if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
            return response()->json(['error' => 'Invalid jar download URL.'], 400);
        }

        $parsedUrl = parse_url($url);
        if (($parsedUrl['scheme'] ?? '') !== 'https') {
            return response()->json(['error' => 'Only HTTPS download URLs are permitted.'], 400);
        }

        // 2. Validate Target Filename
        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));
        if (empty($cleanFilename) || !preg_match('/^[a-zA-Z0-9_\-\.]+\.jar$/i', $cleanFilename)) {
            $cleanFilename = 'server.jar';
        }

        try {
            // 3. Perform Wipe if requested
            if ($wipe) {
                if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
                    return response()->json(['error' => 'You do not have permission to delete server files.'], 403);
                }

                try {
                    $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
                    if (is_array($rootItems)) {
                        $filesToDelete = [];
                        foreach ($rootItems as $item) {
                            $name = $item['name'] ?? '';
                            if (!empty($name) && $name !== '.' && $name !== '..') {
                                $filesToDelete[] = $name;
                            }
                        }
                        if (!empty($filesToDelete)) {
                            $this->fileRepository->setServer($server)->deleteFiles('/', $filesToDelete);
                        }
                    }
                } catch (Exception $e) {
                    // If directory listing fails, proceed with installation
                }
            }

            // 4. Command Wings Daemon to pull the jar directly into root
            $this->fileRepository->setServer($server)->pull(
                $url,
                '/',
                [
                    'filename' => $cleanFilename,
                    'use_header' => true,
                    'foreground' => true,
                ]
            );

            return response()->json([
                'success' => true,
                'message' => "Successfully installed {$cleanFilename} on your server.",
                'filename' => $cleanFilename,
                'wiped' => $wipe,
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to install software jar on server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
