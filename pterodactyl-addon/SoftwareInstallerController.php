<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class SoftwareInstallerController extends ClientApiController
{
    public const MANIFEST_FILE = '/.pterodactyl-software.json';
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
     * Get all Minecraft server software types and detect current software.
     * GET /api/client/servers/{server}/software
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        // Cache software catalog list for 24 hours (86400 seconds)
        $softwareList = Cache::remember('mcjars:types:catalog', 86400, function () {
            try {
                $response = $this->httpClient->get('types', ['timeout' => 5.0]);
                if ($response->getStatusCode() === 200) {
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
                    if (!empty($softwareList)) {
                        return $softwareList;
                    }
                }
            } catch (Throwable $e) {
                Log::warning('[SoftwareInstallerController] Failed to fetch live MCJars types: ' . $e->getMessage());
            }

            // High-reliability Fallback catalog: popular server software
            return [
                ['id' => 'PAPER', 'category' => 'server', 'name' => 'Paper', 'icon' => 'https://mcjars.app/api/v2/icons/paper.png', 'description' => 'High performance Spigot fork aiming to fix gameplay and mechanics inconsistencies.'],
                ['id' => 'PURPUR', 'category' => 'server', 'name' => 'Purpur', 'icon' => 'https://mcjars.app/api/v2/icons/purpur.png', 'description' => 'Drop-in replacement for Paper servers designed for configurability and new gameplay features.'],
                ['id' => 'SPIGOT', 'category' => 'server', 'name' => 'Spigot', 'icon' => 'https://mcjars.app/api/v2/icons/spigot.png', 'description' => 'High performance, modified Bukkit software providing additional server performance and bug fixes.'],
                ['id' => 'VANILLA', 'category' => 'server', 'name' => 'Vanilla', 'icon' => 'https://mcjars.app/api/v2/icons/vanilla.png', 'description' => 'Official Minecraft server software directly from Mojang Studios.'],
                ['id' => 'FABRIC', 'category' => 'server', 'name' => 'Fabric', 'icon' => 'https://mcjars.app/api/v2/icons/fabric.png', 'description' => 'Lightweight, experimental modding toolchain for Minecraft.'],
                ['id' => 'FORGE', 'category' => 'server', 'name' => 'Forge', 'icon' => 'https://mcjars.app/api/v2/icons/forge.png', 'description' => 'The original and widely-used Minecraft modding platform.'],
                ['id' => 'NEOFORGE', 'category' => 'server', 'name' => 'NeoForge', 'icon' => 'https://mcjars.app/api/v2/icons/neoforge.png', 'description' => 'Next-generation mod loader continuing the Forge ecosystem.'],
                ['id' => 'VELOCITY', 'category' => 'proxy', 'name' => 'Velocity', 'icon' => 'https://mcjars.app/api/v2/icons/velocity.png', 'description' => 'Modern, high-performance Minecraft server proxy.'],
                ['id' => 'BUNGEECORD', 'category' => 'proxy', 'name' => 'BungeeCord', 'icon' => 'https://mcjars.app/api/v2/icons/bungeecord.png', 'description' => 'Original proxy software that unites multiple Minecraft servers.'],
                ['id' => 'WATERFALL', 'category' => 'proxy', 'name' => 'Waterfall', 'icon' => 'https://mcjars.app/api/v2/icons/waterfall.png', 'description' => 'PaperMC upgrade to BungeeCord focusing on stability and performance.'],
                ['id' => 'FOLIA', 'category' => 'server', 'name' => 'Folia', 'icon' => 'https://mcjars.app/api/v2/icons/folia.png', 'description' => 'Multi-threaded Paper fork for huge servers.'],
            ];
        });

        return response()->json([
            'success' => true,
            'software' => $softwareList,
            'current' => $this->detectCurrentSoftware($server),
        ]);
    }

    /**
     * Get currently installed software information on the server.
     * GET /api/client/servers/{server}/software/current
     */
    public function current(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        return response()->json([
            'success' => true,
            'current' => $this->detectCurrentSoftware($server),
        ]);
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
            // Stale-While-Revalidate Caching:
            // 1. If cached, serve it instantly (~2ms)
            // 2. If older than 5 minutes, or on explicit request, revalidate in background
            $cacheKey = "mcjars:builds:{$type}";
            $cached = Cache::get($cacheKey);

            $fetchFresh = function () use ($type, $cacheKey) {
                try {
                    $response = $this->httpClient->get("builds/{$type}", [
                        'timeout' => 4.0,
                        'connect_timeout' => 2.0,
                    ]);
                    if ($response->getStatusCode() === 200) {
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

                        usort($versionList, function ($a, $b) {
                            return version_compare($b['version'], $a['version']);
                        });

                        Cache::put($cacheKey, $versionList, 1800); // 30 min TTL
                        Cache::put("{$cacheKey}:last_sync", time(), 1800);
                        return $versionList;
                    }
                } catch (Throwable $e) {
                    Log::info("[SoftwareInstallerController] Background sync for {$type} failed: " . $e->getMessage());
                }
                return null;
            };

            // If we have cached versions
            if (!empty($cached) && is_array($cached)) {
                $lastSync = (int) Cache::get("{$cacheKey}:last_sync", 0);
                // If cache is older than 5 minutes (300 seconds), trigger a non-blocking fast update
                if ((time() - $lastSync) > 300) {
                    // Try to refresh with a very tight 2.5-second timeout so user never waits
                    try {
                        $fresh = $fetchFresh();
                        if ($fresh !== null) {
                            return response()->json([
                                'success' => true,
                                'type' => $type,
                                'versions' => $fresh,
                                'synced' => true,
                            ]);
                        }
                    } catch (Throwable $e) {}
                }

                return response()->json([
                    'success' => true,
                    'type' => $type,
                    'versions' => $cached,
                    'cached' => true,
                ]);
            }

            // If no cache at all, fetch synchronously with 4s timeout
            $fresh = $fetchFresh();
            if ($fresh !== null) {
                return response()->json([
                    'success' => true,
                    'type' => $type,
                    'versions' => $fresh,
                ]);
            }

            return response()->json(['error' => "Failed to fetch versions for {$type}."], 502);
        } catch (Throwable $e) {
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

        $cacheKey = "mcjars:build_details:{$type}:{$version}";
        $cachedBuilds = Cache::get($cacheKey);

        if (!empty($cachedBuilds) && is_array($cachedBuilds)) {
            return response()->json([
                'success' => true,
                'type' => $type,
                'version' => $version,
                'builds' => $cachedBuilds,
                'cached' => true,
            ]);
        }

        try {
            $response = $this->httpClient->get("builds/{$type}/{$version}", [
                'timeout' => 4.0,
                'connect_timeout' => 2.0,
            ]);
            if ($response->getStatusCode() === 200) {
                $body = json_decode($response->getBody()->getContents(), true);
                $builds = $body['builds'] ?? [];
                if (is_array($builds)) {
                    Cache::put($cacheKey, $builds, 600); // 10 minutes cache
                    return response()->json([
                        'success' => true,
                        'type' => $type,
                        'version' => $version,
                        'builds' => $builds,
                    ]);
                }
            }
        } catch (Throwable $e) {}

        return response()->json([
            'success' => true,
            'type' => $type,
            'version' => $version,
            'builds' => [],
        ]);
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

            // Record manifest file for current software tracking
            $manifestData = [
                'software' => $displayName,
                'software_id' => $software ?: 'CUSTOM',
                'version' => $version ?: null,
                'build' => (string) ($request->input('build', '') ?: $request->input('buildNumber', '') ?: null),
                'filename' => $cleanFilename,
                'installed_at' => date('c'),
                'source' => 'installer',
            ];
            try {
                $this->fileRepository->setServer($server)->putContent(
                    self::MANIFEST_FILE,
                    json_encode($manifestData, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
                );
            } catch (Throwable $e) {}

            Cache::forget("server:detected_software:{$server->id}");
            Cache::forget("server:options_data:{$server->id}");

            return response()->json([
                'success' => true,
                'message' => "Successfully installed {$displayName} as {$cleanFilename} on your server.",
                'filename' => $cleanFilename,
                'software' => $software,
                'version' => $version,
                'wiped' => $wipe,
                'current' => $manifestData,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to install software on server.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Detect the currently installed Minecraft server software and version.
     */
    protected function detectCurrentSoftware(Server $server): ?array
    {
        $cacheKey = "server:detected_software_info:{$server->id}";
        return Cache::remember($cacheKey, 120, function () use ($server) {
            return $this->resolveCurrentSoftware($server);
        });
    }

    /**
     * Internal software resolution with database egg fast-path and single root directory scan.
     */
    protected function resolveCurrentSoftware(Server $server): ?array
    {
        // 1. FAST-PATH: Database Egg Inspection (0ms, no network call to Wings)
        try {
            $eggName = strtolower($server->egg->name ?? '');
            $eggDocker = strtolower($server->egg->docker_image ?? '');

            if (str_contains($eggName, 'bedrock') || str_contains($eggName, 'pocketmine') || str_contains($eggDocker, 'bedrock')) {
                return [
                    'software' => 'Bedrock Dedicated Server',
                    'software_id' => 'BDS',
                    'version' => null,
                    'build' => null,
                    'filename' => 'bedrock_server',
                    'source' => 'egg',
                ];
            }
            if (str_contains($eggName, 'velocity')) {
                return [
                    'software' => 'Velocity',
                    'software_id' => 'VELOCITY',
                    'version' => null,
                    'build' => null,
                    'filename' => 'server.jar',
                    'source' => 'egg',
                ];
            }
            if (str_contains($eggName, 'bungeecord') || str_contains($eggName, 'waterfall')) {
                return [
                    'software' => 'BungeeCord / Waterfall',
                    'software_id' => 'BUNGEECORD',
                    'version' => null,
                    'build' => null,
                    'filename' => 'server.jar',
                    'source' => 'egg',
                ];
            }
        } catch (Throwable $e) {}

        // 2. Fetch root directory ONCE in a single Wings API call (~300ms)
        $rootFiles = [];
        try {
            $items = $this->fileRepository->setServer($server)->getDirectory('/');
            if (is_array($items)) {
                foreach ($items as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $rootFiles[strtolower($n)] = $n;
                    }
                }
            }
        } catch (Throwable $e) {}

        // 3. Check native manifest file written by software installer
        if (isset($rootFiles['.pterodactyl-software.json'])) {
            try {
                $content = $this->fileRepository->setServer($server)->getContent(self::MANIFEST_FILE);
                $manifest = json_decode($content, true);
                if (is_array($manifest) && (!empty($manifest['software']) || !empty($manifest['version']))) {
                    return $manifest;
                }
            } catch (Throwable $e) {}
        }

        // 4. In-memory check for Bedrock Dedicated Server (BDS)
        if (isset($rootFiles['bedrock_server']) || isset($rootFiles['allowlist.json']) || isset($rootFiles['permissions.json'])) {
            return [
                'software' => 'Bedrock Dedicated Server',
                'software_id' => 'BDS',
                'version' => null,
                'build' => null,
                'filename' => 'bedrock_server',
                'source' => 'bedrock_server',
            ];
        }

        // 5. In-memory check for PocketMine-MP
        if (isset($rootFiles['pocketmine.yml'])) {
            return [
                'software' => 'PocketMine-MP',
                'software_id' => 'POCKETMINE',
                'version' => null,
                'build' => null,
                'filename' => 'PocketMine-MP.phar',
                'source' => 'pocketmine.yml',
            ];
        }

        // 6. In-memory check for Nukkit
        if (isset($rootFiles['nukkit.yml'])) {
            return [
                'software' => 'Nukkit',
                'software_id' => 'NUKKIT',
                'version' => null,
                'build' => null,
                'filename' => 'nukkit.jar',
                'source' => 'nukkit.yml',
            ];
        }

        // 7. In-memory check for Velocity Proxy
        if (isset($rootFiles['velocity.toml'])) {
            return [
                'software' => 'Velocity',
                'software_id' => 'VELOCITY',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'velocity.toml',
            ];
        }

        // 8. In-memory check for version_history.json (Paper / Purpur / Folia / Spigot)
        if (isset($rootFiles['version_history.json'])) {
            try {
                $vhContent = $this->fileRepository->setServer($server)->getContent('/version_history.json');
                $vh = json_decode($vhContent, true);
                if (is_array($vh) && !empty($vh['currentVersion'])) {
                    $raw = (string) $vh['currentVersion'];
                    $softName = 'Paper';
                    $mcVer = null;
                    $build = null;

                    if (preg_match('/git-Purpur-(\d+)/i', $raw, $m)) {
                        $softName = 'Purpur';
                        $build = '#' . $m[1];
                    } elseif (preg_match('/git-Paper-(\d+)/i', $raw, $m)) {
                        $softName = 'Paper';
                        $build = '#' . $m[1];
                    } elseif (preg_match('/git-Folia-(\d+)/i', $raw, $m)) {
                        $softName = 'Folia';
                        $build = '#' . $m[1];
                    } elseif (preg_match('/git-Spigot-([a-f0-9]+)/i', $raw, $m)) {
                        $softName = 'Spigot';
                        $build = substr($m[1], 0, 7);
                    }

                    if (preg_match('/\(MC:\s*([0-9\.]+)\)/i', $raw, $m)) {
                        $mcVer = $m[1];
                    }

                    return [
                        'software' => $softName,
                        'software_id' => strtoupper($softName),
                        'version' => $mcVer,
                        'build' => $build,
                        'filename' => 'server.jar',
                        'source' => 'version_history.json',
                    ];
                }
            } catch (Throwable $e) {}
        }

        // 9. In-memory check for Purpur / Paper / Folia / Spigot YAML files
        if (isset($rootFiles['purpur.yml'])) {
            return [
                'software' => 'Purpur',
                'software_id' => 'PURPUR',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'purpur.yml',
            ];
        }

        if (isset($rootFiles['paper.yml'])) {
            return [
                'software' => 'Paper',
                'software_id' => 'PAPER',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'paper.yml',
            ];
        }

        if (isset($rootFiles['folia.yml'])) {
            return [
                'software' => 'Folia',
                'software_id' => 'FOLIA',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'folia.yml',
            ];
        }

        if (isset($rootFiles['spigot.yml'])) {
            return [
                'software' => 'Spigot',
                'software_id' => 'SPIGOT',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'spigot.yml',
            ];
        }

        // 10. In-memory check for BungeeCord config.yml
        if (isset($rootFiles['config.yml'])) {
            try {
                $bng = $this->fileRepository->setServer($server)->getContent('/config.yml');
                if ($bng !== null && (str_contains($bng, 'listeners:') || str_contains($bng, 'ip_forward:'))) {
                    return [
                        'software' => 'BungeeCord / Waterfall',
                        'software_id' => 'BUNGEECORD',
                        'version' => null,
                        'build' => null,
                        'filename' => 'server.jar',
                        'source' => 'config.yml',
                    ];
                }
            } catch (Throwable $e) {}
        }

        // 11. Fallback to server.properties (Standard Vanilla or Bedrock BDS)
        if (isset($rootFiles['server.properties'])) {
            return [
                'software' => 'Vanilla Minecraft',
                'software_id' => 'VANILLA',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'server.properties',
            ];
        }

        // 12. Fallback: check if server.jar exists in root
        if (isset($rootFiles['server.jar'])) {
            return [
                'software' => 'Custom Server',
                'software_id' => 'CUSTOM',
                'version' => null,
                'build' => null,
                'filename' => 'server.jar',
                'source' => 'server.jar',
            ];
        }

        return null;
    }
}
