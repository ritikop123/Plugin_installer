<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use ZipArchive;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class ModpackInstallerController extends ClientApiController
{
    private const MODRINTH_API = 'https://api.modrinth.com/v2/';
    private const USER_AGENT = 'Arix-Modpack-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)';
    private const MANIFEST_FILE = '/.pterodactyl-modpack.json';

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
            'timeout' => 25.0,
            'http_errors' => false,
        ]);
    }

    /**
     * Search modpacks from public Modrinth API.
     * GET /api/client/servers/{server}/modpacks
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $query = (string) $request->query('query', '');
        $loader = strtolower(trim((string) $request->query('loader', 'all')));
        $gameVersion = trim((string) $request->query('version', $request->query('game_version', 'all')));
        $category = trim((string) $request->query('category', 'all'));
        $sortBy = (string) $request->query('sort', $request->query('sort_by', 'downloads'));
        $page = max(1, (int) $request->query('page', 1));
        $limit = min(50, max(1, (int) $request->query('limit', 20)));
        $offset = ($page - 1) * $limit;

        $facets = [];

        // 1. Must be a modpack
        $facets[] = ['project_type:modpack'];

        // 2. Mod Loaders
        if (!empty($loader) && $loader !== 'all' && in_array($loader, ['fabric', 'forge', 'neoforge', 'quilt'])) {
            $facets[] = ["categories:{$loader}"];
        }

        // 3. Minecraft Version
        if (!empty($gameVersion) && $gameVersion !== 'all') {
            $facets[] = ["versions:{$gameVersion}"];
        }

        // 4. Category
        if (!empty($category) && $category !== 'all') {
            $facets[] = ["categories:{$category}"];
        }

        $params = [
            'query' => trim($query),
            'limit' => $limit,
            'offset' => $offset,
            'index' => in_array($sortBy, ['downloads', 'relevance', 'updated', 'newest', 'follows']) ? $sortBy : 'downloads',
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
                    'error' => 'Modrinth API returned error status',
                    'status' => $statusCode,
                ], 502);
            }

            $data = json_decode($response->getBody()->getContents(), true);
            return response()->json($data ?: ['hits' => [], 'total_hits' => 0]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to connect to Modrinth API',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get versions for a specific modpack.
     * GET /api/client/servers/{server}/modpacks/versions?project_id=<id>&loader=<loader>&version=<mc_ver>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $projectId = trim((string) $request->query('project_id', $request->query('mod', $request->query('id', ''))));
        $loader = strtolower(trim((string) $request->query('loader', '')));
        $gameVersion = trim((string) $request->query('version', $request->query('game_version', '')));

        if (empty($projectId) || !preg_match('/^[a-zA-Z0-9_-]+$/', $projectId)) {
            return response()->json(['error' => 'Valid project ID is required.'], 400);
        }

        $query = [];
        if (!empty($loader) && in_array($loader, ['fabric', 'forge', 'neoforge', 'quilt'])) {
            $query['loaders'] = json_encode([$loader]);
        }
        if (!empty($gameVersion) && $gameVersion !== 'all') {
            $query['game_versions'] = json_encode([$gameVersion]);
        }

        try {
            $response = $this->httpClient->get("project/{$projectId}/version", [
                'query' => $query,
            ]);

            $statusCode = $response->getStatusCode();
            if ($statusCode >= 400) {
                return response()->json(['error' => 'Failed to fetch versions from Modrinth.'], 502);
            }

            $raw = json_decode($response->getBody()->getContents(), true);
            return response()->json(is_array($raw) ? $raw : []);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to fetch modpack versions',
                'message' => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get modpack category tags.
     * GET /api/client/servers/{server}/modpacks/categories
     */
    public function categories(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $fallbackCategories = [
            ['name' => 'adventure', 'header' => 'Adventure'],
            ['name' => 'challenging', 'header' => 'Challenging'],
            ['name' => 'combat', 'header' => 'Combat / PvP'],
            ['name' => 'kitchen-sink', 'header' => 'Kitchen Sink'],
            ['name' => 'lightweight', 'header' => 'Lightweight'],
            ['name' => 'magic', 'header' => 'Magic'],
            ['name' => 'multiplayer', 'header' => 'Multiplayer'],
            ['name' => 'optimization', 'header' => 'Optimization / Performance'],
            ['name' => 'quests', 'header' => 'Quests'],
            ['name' => 'technology', 'header' => 'Technology'],
        ];

        try {
            $response = $this->httpClient->get('tag/category');
            if ($response->getStatusCode() === 200) {
                $allCats = json_decode($response->getBody()->getContents(), true);
                if (is_array($allCats)) {
                    $modpackCats = [];
                    foreach ($allCats as $cat) {
                        if (($cat['project_type'] ?? '') === 'modpack') {
                            $modpackCats[] = [
                                'name' => $cat['name'] ?? '',
                                'header' => $cat['header'] ?? ucfirst($cat['name'] ?? ''),
                            ];
                        }
                    }
                    if (!empty($modpackCats)) {
                        return response()->json($modpackCats);
                    }
                }
            }
        } catch (Throwable $e) {}

        return response()->json($fallbackCategories);
    }

    /**
     * Get currently installed modpack information from server manifest.
     * GET /api/client/servers/{server}/modpacks/installed
     */
    public function installed(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $content = $this->fileRepository->setServer($server)->getContent(self::MANIFEST_FILE);
            $manifest = json_decode($content, true);

            if (is_array($manifest) && !empty($manifest['project_id'])) {
                return response()->json([
                    'has_modpack' => true,
                    'manifest' => $manifest,
                ]);
            }
        } catch (Throwable $e) {
            // Manifest not found or empty
        }

        return response()->json([
            'has_modpack' => false,
            'manifest' => null,
        ]);
    }

    /**
     * Step 1: Prepare Modpack installation.
     * Downloads .mrpack, parses modrinth.index.json, handles optional wipe,
     * extracts configs/overrides, and returns list of server mods to download.
     * POST /api/client/servers/{server}/modpacks/prepare
     */
    public function prepare(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        @set_time_limit(300);
        @ini_set('max_execution_time', '300');

        $versionId = trim((string) $request->input('version_id', ''));
        $wipeMode = trim((string) $request->input('wipe_mode', 'mods_and_configs'));

        if (empty($versionId) || !preg_match('/^[a-zA-Z0-9_-]+$/', $versionId)) {
            return response()->json(['error' => 'Valid version ID is required.'], 400);
        }

        try {
            // 1. Fetch version metadata from Modrinth
            $verRes = $this->httpClient->get("version/{$versionId}");
            if ($verRes->getStatusCode() !== 200) {
                return response()->json(['error' => 'Failed to fetch version metadata from Modrinth.'], 502);
            }

            $verData = json_decode($verRes->getBody()->getContents(), true);
            $files = $verData['files'] ?? [];

            $mrpackUrl = null;
            foreach ($files as $f) {
                $fn = strtolower($f['filename'] ?? '');
                if (str_ends_with($fn, '.mrpack')) {
                    $mrpackUrl = $f['url'] ?? null;
                    break;
                }
            }

            if (!$mrpackUrl && !empty($files[0]['url'])) {
                $mrpackUrl = $files[0]['url'];
            }

            if (!$mrpackUrl || !filter_var($mrpackUrl, FILTER_VALIDATE_URL)) {
                return response()->json(['error' => 'No valid modpack archive (.mrpack) found for this version.'], 400);
            }

            // 2. Download .mrpack to a temporary file
            $tempPack = tempnam(sys_get_temp_dir(), 'ptero_mrpack_');
            $client = new Client(['timeout' => 180.0, 'http_errors' => false]);
            $packRes = $client->get($mrpackUrl, ['sink' => $tempPack]);

            if ($packRes->getStatusCode() !== 200) {
                @unlink($tempPack);
                return response()->json(['error' => 'Failed to download .mrpack file.'], 502);
            }

            // 3. Open .mrpack with ZipArchive if available
            $modsToInstall = [];
            $dependencies = [];
            $overridesCount = 0;

            if (class_exists('ZipArchive')) {
                $zip = new ZipArchive();
                if ($zip->open($tempPack) === true) {
                    $indexContent = $zip->getFromName('modrinth.index.json');
                    if ($indexContent !== false) {
                        $index = json_decode($indexContent, true);
                        if (is_array($index)) {
                            $dependencies = $index['dependencies'] ?? [];
                            $rawFiles = $index['files'] ?? [];

                            foreach ($rawFiles as $item) {
                                $serverEnv = $item['env']['server'] ?? 'required';
                                if ($serverEnv === 'unsupported') {
                                    continue;
                                }

                                $path = $item['path'] ?? '';
                                $downloads = $item['downloads'] ?? [];
                                if (empty($path) || empty($downloads)) {
                                    continue;
                                }

                                $cleanPath = ltrim(str_replace('\\', '/', $path), '/');
                                $fileName = basename($cleanPath);
                                $dir = dirname($cleanPath);
                                if ($dir === '.' || empty($dir)) {
                                    $dir = 'mods';
                                }

                                $modsToInstall[] = [
                                    'name' => $fileName,
                                    'path' => $cleanPath,
                                    'directory' => '/' . $dir,
                                    'filename' => $fileName,
                                    'url' => $downloads[0],
                                    'size' => (int) ($item['fileSize'] ?? 0),
                                ];
                            }
                        }
                    }

                    // Handle Wipe
                    if ($wipeMode === 'full_server') {
                        if ($request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
                            try {
                                $rootItems = $this->fileRepository->setServer($server)->getDirectory('/');
                                if (is_array($rootItems)) {
                                    $toDelete = [];
                                    foreach ($rootItems as $it) {
                                        $name = $it['name'] ?? '';
                                        if (!empty($name) && $name !== '.' && $name !== '..') {
                                            $toDelete[] = $name;
                                        }
                                    }
                                    if (!empty($toDelete)) {
                                        $this->fileRepository->setServer($server)->deleteFiles('/', $toDelete);
                                    }
                                }
                            } catch (Throwable $e) {}
                        }
                    } elseif ($wipeMode === 'mods_and_configs') {
                        if ($request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
                            try {
                                $this->fileRepository->setServer($server)->deleteFiles('/', ['mods', 'config', 'defaultconfigs']);
                            } catch (Throwable $e) {}
                        }
                    }

                    // Extract overrides efficiently in a single operation via Wings decompressFile
                    $overridesZipPath = tempnam(sys_get_temp_dir(), 'ptero_overrides_') . '.zip';
                    $overridesZip = new ZipArchive();
                    $hasOverrides = false;

                    if ($overridesZip->open($overridesZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) === true) {
                        for ($i = 0; $i < $zip->numFiles; $i++) {
                            $stat = $zip->statIndex($i);
                            $entryName = $stat['name'] ?? '';
                            if (empty($entryName) || str_ends_with($entryName, '/')) {
                                continue;
                            }

                            $relPath = null;
                            if (str_starts_with($entryName, 'overrides/')) {
                                $relPath = substr($entryName, strlen('overrides/'));
                            } elseif (str_starts_with($entryName, 'server-overrides/')) {
                                $relPath = substr($entryName, strlen('server-overrides/'));
                            }

                            if ($relPath) {
                                $fileData = $zip->getFromIndex($i);
                                if ($fileData !== false) {
                                    $overridesZip->addFromString($relPath, $fileData);
                                    $hasOverrides = true;
                                    $overridesCount++;
                                }
                            }
                        }
                        $overridesZip->close();

                        if ($hasOverrides && file_exists($overridesZipPath) && filesize($overridesZipPath) > 0) {
                            try {
                                $zipName = '.modpack_overrides_' . time() . '.zip';
                                $this->fileRepository->setServer($server)->putContent('/' . $zipName, file_get_contents($overridesZipPath));
                                $this->fileRepository->setServer($server)->decompressFile('/', $zipName);
                                $this->fileRepository->setServer($server)->deleteFiles('/', [$zipName]);
                            } catch (Throwable $e) {}
                        }
                        @unlink($overridesZipPath);
                    }

                    $zip->close();
                }
            }

            @unlink($tempPack);

            $detectedLoader = isset($dependencies['fabric-loader']) ? 'fabric'
                : (isset($dependencies['forge']) ? 'forge'
                : (isset($dependencies['neoforge']) ? 'neoforge'
                : (isset($dependencies['quilt-loader']) ? 'quilt' : 'modded')));

            return response()->json([
                'success' => true,
                'version_id' => $versionId,
                'game_version' => $dependencies['minecraft'] ?? 'Unknown',
                'loader' => $detectedLoader,
                'total_files' => count($modsToInstall),
                'files' => $modsToInstall,
                'overrides_extracted' => $overridesCount,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to prepare modpack.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Step 2: Install a batch of mod files via Wings.
     * POST /api/client/servers/{server}/modpacks/install-batch
     */
    public function installBatch(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        @set_time_limit(180);
        @ini_set('max_execution_time', '180');

        $files = $request->input('files', []);
        if (!is_array($files) || empty($files)) {
            return response()->json(['error' => 'No files provided in batch.'], 400);
        }

        $installed = [];
        $errors = [];

        foreach ($files as $file) {
            $url = $file['url'] ?? '';
            $directory = $file['directory'] ?? '/mods';
            $filename = $file['filename'] ?? '';

            if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL) || !str_starts_with($url, 'https://')) {
                $errors[] = ['file' => $filename, 'error' => 'Invalid URL'];
                continue;
            }

            $cleanFilename = basename(str_replace(['\\', '/', "\0"], '', $filename));
            if (empty($cleanFilename)) {
                $cleanFilename = 'mod.jar';
            }

            try {
                $this->fileRepository->setServer($server)->pull(
                    $url,
                    $directory,
                    [
                        'filename' => $cleanFilename,
                        'use_header' => true,
                        'foreground' => true,
                    ]
                );
                $installed[] = $cleanFilename;
            } catch (Throwable $e) {
                $errors[] = ['file' => $cleanFilename, 'error' => $e->getMessage()];
            }
        }

        return response()->json([
            'success' => true,
            'installed_count' => count($installed),
            'installed_files' => $installed,
            'errors' => $errors,
        ]);
    }

    /**
     * Step 3: Finalize Modpack installation and record manifest.
     * POST /api/client/servers/{server}/modpacks/finalize
     */
    public function finalize(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $manifest = [
            'project_id' => (string) $request->input('project_id', ''),
            'title' => (string) $request->input('title', 'Minecraft Modpack'),
            'version_id' => (string) $request->input('version_id', ''),
            'version_name' => (string) $request->input('version_name', ''),
            'loader' => (string) $request->input('loader', 'modded'),
            'minecraft' => (string) $request->input('minecraft', ''),
            'icon_url' => (string) $request->input('icon_url', ''),
            'installed_at' => date('c'),
            'total_mods' => (int) $request->input('total_mods', 0),
            'installed_files' => $request->input('installed_files', []),
        ];

        try {
            $this->fileRepository->setServer($server)->putContent(
                self::MANIFEST_FILE,
                json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            );

            return response()->json([
                'success' => true,
                'message' => 'Modpack successfully finalized!',
                'manifest' => $manifest,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to write modpack manifest file.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Uninstall currently active modpack.
     * POST /api/client/servers/{server}/modpacks/uninstall
     */
    public function uninstall(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $wipeModsDir = (bool) $request->input('wipe_mods', true);

        try {
            // Delete manifest file
            try {
                $this->fileRepository->setServer($server)->deleteFiles('/', [ltrim(self::MANIFEST_FILE, '/')]);
            } catch (Throwable $e) {}

            // Wipe mods directory if requested
            if ($wipeModsDir) {
                try {
                    $modFiles = $this->fileRepository->setServer($server)->getDirectory('/mods');
                    if (is_array($modFiles)) {
                        $toDelete = [];
                        foreach ($modFiles as $mf) {
                            $name = $mf['name'] ?? '';
                            if (!empty($name) && $name !== '.' && $name !== '..') {
                                $toDelete[] = $name;
                            }
                        }
                        if (!empty($toDelete)) {
                            $this->fileRepository->setServer($server)->deleteFiles('/mods', $toDelete);
                        }
                    }
                } catch (Throwable $e) {}
            }

            return response()->json([
                'success' => true,
                'message' => 'Modpack removed successfully.',
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to uninstall modpack.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
