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
     * Install software jar/archive onto server, with optional server file wipe.
     * Supports standalone JARs (Paper, Purpur, Fabric, Vanilla, etc.) and
     * multi-file/ZIP server packages (Forge, NeoForge, etc.) with automatic
     * library management and guaranteed server.jar naming.
     *
     * POST /api/client/servers/{server}/software/install
     */
    public function install(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        @set_time_limit(300);
        @ini_set('max_execution_time', '300');
        config(['pterodactyl.guzzle.timeout' => 300]);
        config(['pterodactyl.guzzle.connect_timeout' => 30]);

        $url = (string) $request->input('url', '');
        $jarUrl = (string) $request->input('jarUrl', '');
        $zipUrl = (string) $request->input('zipUrl', '');
        $software = strtoupper(trim((string) $request->input('software', '')));
        $version = trim((string) $request->input('version', ''));
        $installation = $request->input('installation', []);
        $wipe = (bool) $request->input('wipe', false);
        $filename = (string) $request->input('filename', 'server.jar');

        // Target executable jar name (always sanitized to a .jar filename)
        $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));
        if (empty($cleanFilename) || !preg_match('/^[a-zA-Z0-9_\-\.]+\.jar$/i', $cleanFilename)) {
            $cleanFilename = 'server.jar';
        }

        // Determine if this is a ZIP-based installation (e.g. Forge, NeoForge, or server.jar.zip)
        $isZip = false;
        $targetZipUrl = '';

        if (!empty($zipUrl) && filter_var($zipUrl, FILTER_VALIDATE_URL) && str_starts_with($zipUrl, 'https://')) {
            $isZip = true;
            $targetZipUrl = $zipUrl;
        } elseif (!empty($url) && preg_match('/\.zip(\?.*)?$/i', $url) && filter_var($url, FILTER_VALIDATE_URL) && str_starts_with($url, 'https://')) {
            $isZip = true;
            $targetZipUrl = $url;
        } elseif (in_array($software, ['FORGE', 'NEOFORGE'], true)) {
            $isZip = true;
            if (!empty($zipUrl)) {
                $targetZipUrl = $zipUrl;
            } elseif (!empty($url)) {
                $targetZipUrl = $url;
            } elseif (is_array($installation)) {
                foreach ($installation as $batch) {
                    if (is_array($batch)) {
                        foreach ($batch as $step) {
                            if (($step['type'] ?? '') === 'download' && preg_match('/\.zip(\?.*)?$/i', $step['url'] ?? '')) {
                                $targetZipUrl = $step['url'];
                                break 2;
                            }
                        }
                    }
                }
            }
        }

        // Validate primary download target
        $targetDownloadUrl = $isZip ? $targetZipUrl : ($jarUrl ?: $url);
        if (empty($targetDownloadUrl) || !filter_var($targetDownloadUrl, FILTER_VALIDATE_URL) || !str_starts_with($targetDownloadUrl, 'https://')) {
            return response()->json(['error' => 'Valid HTTPS software download URL is required.'], 400);
        }

        try {
            // 1. Perform Wipe if requested
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
                } catch (Throwable $e) {
                    // If directory listing fails, proceed with installation
                }
            }

            if ($isZip) {
                // ============================================================
                // ZIP-BASED INSTALLATION (Forge, NeoForge, etc.)
                // ============================================================

                // A. Execute any prerequisite standalone downloads specified by MCJars installation steps
                // E.g. For Forge 1.12.2: downloads vanilla minecraft_server.1.12.2.jar
                if (is_array($installation)) {
                    foreach ($installation as $batch) {
                        if (is_array($batch)) {
                            foreach ($batch as $step) {
                                $stepType = $step['type'] ?? '';
                                $stepUrl = $step['url'] ?? '';
                                $stepFile = $step['file'] ?? '';

                                if (
                                    $stepType === 'download' &&
                                    !empty($stepUrl) &&
                                    !empty($stepFile) &&
                                    !preg_match('/\.zip(\?.*)?$/i', $stepFile) &&
                                    filter_var($stepUrl, FILTER_VALIDATE_URL) &&
                                    str_starts_with($stepUrl, 'https://')
                                ) {
                                    $cleanStepFile = basename(str_replace(['\\', '/', "\0"], '', $stepFile));
                                    try {
                                        $this->fileRepository->setServer($server)->pull(
                                            $stepUrl,
                                            '/',
                                            [
                                                'filename' => $cleanStepFile,
                                                'use_header' => false,
                                                'foreground' => true,
                                            ]
                                        );
                                    } catch (Throwable $e) {
                                        // Non-fatal if secondary file fails
                                    }
                                }
                            }
                        }
                    }
                }

                // B. Remove existing libraries directory to avoid old classpath conflicts (if server wasn't already wiped)
                if (!$wipe) {
                    try {
                        $this->fileRepository->setServer($server)->deleteFiles('/', ['libraries']);
                    } catch (Throwable $e) {}
                }

                // C. Pull the zip package to root using a temporary archive filename
                $tempZip = '.software_install_' . time() . '.zip';
                $this->fileRepository->setServer($server)->pull(
                    $targetZipUrl,
                    '/',
                    [
                        'filename' => $tempZip,
                        'use_header' => false,
                        'foreground' => true,
                    ]
                );

                // D. Decompress the archive directly into server root (extracts server.jar and libraries/)
                $this->fileRepository->setServer($server)->decompressFile('/', $tempZip);

                // E. Clean up the temporary zip archive (and any leftover mcvapi.server.jar.zip)
                try {
                    $this->fileRepository->setServer($server)->deleteFiles('/', [$tempZip, 'mcvapi.server.jar.zip']);
                } catch (Throwable $e) {}

                // F. Verify that the primary executable is properly named server.jar (or $cleanFilename)
                try {
                    $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
                    if (is_array($rootItems)) {
                        $hasCleanJar = false;
                        $candidateJars = [];
                        foreach ($rootItems as $item) {
                            $name = $item['name'] ?? '';
                            if ($name === $cleanFilename) {
                                $hasCleanJar = true;
                                break;
                            }
                            // Detect candidate jars in root (exclude secondary vanilla backend jar like minecraft_server.1.12.2.jar)
                            if (
                                str_ends_with(strtolower($name), '.jar') &&
                                !str_starts_with(strtolower($name), 'minecraft_server') &&
                                $name !== '.' && $name !== '..'
                            ) {
                                $candidateJars[] = $name;
                            }
                        }

                        // If server.jar does not exist, rename candidate forge jar to server.jar
                        if (!$hasCleanJar && !empty($candidateJars)) {
                            $this->fileRepository->setServer($server)->renameFiles('/', [
                                ['from' => $candidateJars[0], 'to' => $cleanFilename],
                            ]);
                        }
                    }
                } catch (Throwable $e) {}

            } else {
                // ============================================================
                // STANDALONE JAR INSTALLATION (Paper, Purpur, Fabric, etc.)
                // ============================================================

                // Command Wings Daemon to pull the jar directly into root.
                // CRITICAL: use_header => false ensures Wings strictly writes to $cleanFilename ('server.jar')
                // instead of using Content-Disposition header (e.g. 'paper-1.20.4-330.jar').
                $this->fileRepository->setServer($server)->pull(
                    $targetDownloadUrl,
                    '/',
                    [
                        'filename' => $cleanFilename,
                        'use_header' => false,
                        'foreground' => true,
                    ]
                );

                // Post-verification: ensure server.jar exists; if Wings saved under URL filename, rename it
                try {
                    $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
                    if (is_array($rootItems)) {
                        $hasCleanJar = false;
                        $urlBasename = basename(parse_url($targetDownloadUrl, PHP_URL_PATH) ?? '');
                        $foundAlternate = null;

                        foreach ($rootItems as $item) {
                            $name = $item['name'] ?? '';
                            if ($name === $cleanFilename) {
                                $hasCleanJar = true;
                                break;
                            }
                            if (!empty($urlBasename) && $name === $urlBasename) {
                                $foundAlternate = $name;
                            }
                        }

                        if (!$hasCleanJar && !empty($foundAlternate)) {
                            $this->fileRepository->setServer($server)->renameFiles('/', [
                                ['from' => $foundAlternate, 'to' => $cleanFilename],
                            ]);
                        }
                    }
                } catch (Throwable $e) {}
            }

            $displayName = !empty($software) ? $software : 'Minecraft server software';
            return response()->json([
                'success' => true,
                'message' => "Successfully installed {$displayName} as {$cleanFilename} on your server.",
                'filename' => $cleanFilename,
                'software' => $software,
                'version' => $version,
                'wiped' => $wipe,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to install software on server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
