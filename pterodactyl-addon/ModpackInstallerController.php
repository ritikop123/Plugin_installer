<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
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
    private const MODRINTH_API = "https://api.modrinth.com/v2/";
    private const USER_AGENT = "Arix-Modpack-Installer/1.0.0 (https://github.com/ritikop123/Plugin_installer)";
    private const MANIFEST_FILE = "/.pterodactyl-modpack.json";

    protected Client $httpClient;
    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
        $this->httpClient = new Client([
            "base_uri" => self::MODRINTH_API,
            "headers" => [
                "User-Agent" => self::USER_AGENT,
                "Accept" => "application/json",
            ],
            "timeout" => 20.0,
            "http_errors" => false,
        ]);
    }

    /**
     * Search and list modpacks from Modrinth.
     * GET /api/client/servers/{server}/modpacks
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $query = trim($request->query("query", ""));
        $category = trim($request->query("category", ""));
        $loader = strtolower(trim($request->query("loader", "")));
        $version = trim($request->query("version", ""));
        $sort = strtolower(trim($request->query("sort", "downloads")));
        $page = max(1, (int) $request->query("page", 1));
        $limit = min(50, max(1, (int) $request->query("limit", 20)));
        $offset = ($page - 1) * $limit;

        $indexSort = match ($sort) {
            "relevance" => "relevance",
            "follows" => "follows",
            "newest" => "newest",
            "updated" => "updated",
            default => "downloads",
        };

        // Build facets
        $facets = [
            ['project_type:modpack']
        ];

        if (!empty($category)) {
            $facets[] = ["categories:" . $category];
        }

        if (!empty($loader) && in_array($loader, ["fabric", "forge", "neoforge", "quilt"])) {
            $facets[] = ["categories:" . $loader];
        }

        if (!empty($version)) {
            $facets[] = ["versions:" . $version];
        }

        $params = [
            "query" => $query,
            "facets" => json_encode($facets),
            "index" => $indexSort,
            "offset" => $offset,
            "limit" => $limit,
        ];

        try {
            $response = $this->httpClient->get("search", ["query" => $params]);
            if ($response->getStatusCode() !== 200) {
                return response()->json(["error" => "Failed to fetch modpacks from Modrinth API."], 502);
            }

            $body = json_decode($response->getBody()->getContents(), true);
            $hits = $body["hits"] ?? [];
            $totalHits = $body["total_hits"] ?? 0;

            $modpacks = [];
            foreach ($hits as $hit) {
                $modpacks[] = [
                    "id" => $hit["project_id"] ?? "",
                    "slug" => $hit["slug"] ?? "",
                    "title" => $hit["title"] ?? "",
                    "description" => $hit["description"] ?? "",
                    "categories" => $hit["categories"] ?? [],
                    "client_side" => $hit["client_side"] ?? "",
                    "server_side" => $hit["server_side"] ?? "",
                    "icon_url" => $hit["icon_url"] ?? null,
                    "color" => $hit["color"] ?? null,
                    "author" => $hit["author"] ?? "",
                    "downloads" => (int) ($hit["downloads"] ?? 0),
                    "follows" => (int) ($hit["follows"] ?? 0),
                    "versions" => $hit["versions"] ?? [],
                    "latest_version" => $hit["latest_version"] ?? null,
                    "date_modified" => $hit["date_modified"] ?? null,
                ];
            }

            return response()->json([
                "success" => true,
                "modpacks" => $modpacks,
                "total" => $totalHits,
                "page" => $page,
                "limit" => $limit,
            ]);
        } catch (GuzzleException $e) {
            return response()->json([
                "error" => "Failed to communicate with Modrinth search service.",
                "message" => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get versions for a specific modpack project.
     * GET /api/client/servers/{server}/modpacks/versions?project_id=<ID>&loader=<LOADER>&version=<MC_VER>
     */
    public function versions(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        $projectId = trim($request->query("project_id", ""));
        $loader = strtolower(trim($request->query("loader", "")));
        $gameVersion = trim($request->query("version", ""));

        if (empty($projectId) || !preg_match("/^[a-zA-Z0-9_-]+$/", $projectId)) {
            return response()->json(["error" => "Valid project ID is required."], 400);
        }

        $query = [];
        if (!empty($loader) && in_array($loader, ["fabric", "forge", "neoforge", "quilt"])) {
            $query["loaders"] = json_encode([$loader]);
        }
        if (!empty($gameVersion)) {
            $query["game_versions"] = json_encode([$gameVersion]);
        }

        try {
            $response = $this->httpClient->get("project/{$projectId}/version", [
                "query" => $query,
            ]);

            if ($response->getStatusCode() !== 200) {
                return response()->json(["error" => "Failed to fetch modpack versions."], 502);
            }

            $rawVersions = json_decode($response->getBody()->getContents(), true);
            if (!is_array($rawVersions)) {
                $rawVersions = [];
            }

            $versions = [];
            foreach ($rawVersions as $ver) {
                // Find primary mrpack file or first mrpack file
                $files = $ver["files"] ?? [];
                $mrpackFile = null;
                foreach ($files as $file) {
                    $fn = strtolower($file["filename"] ?? "");
                    if (str_ends_with($fn, ".mrpack")) {
                        if ($file["primary"] ?? false) {
                            $mrpackFile = $file;
                            break;
                        }
                        if (!$mrpackFile) {
                            $mrpackFile = $file;
                        }
                    }
                }

                if (!$mrpackFile && !empty($files)) {
                    $mrpackFile = $files[0];
                }

                $versions[] = [
                    "id" => $ver["id"] ?? "",
                    "name" => $ver["name"] ?? "",
                    "version_number" => $ver["version_number"] ?? "",
                    "game_versions" => $ver["game_versions"] ?? [],
                    "loaders" => $ver["loaders"] ?? [],
                    "date_published" => $ver["date_published"] ?? null,
                    "downloads" => (int) ($ver["downloads"] ?? 0),
                    "file" => $mrpackFile ? [
                        "filename" => $mrpackFile["filename"] ?? "",
                        "url" => $mrpackFile["url"] ?? "",
                        "size" => (int) ($mrpackFile["size"] ?? 0),
                    ] : null,
                ];
            }

            return response()->json([
                "success" => true,
                "project_id" => $projectId,
                "versions" => $versions,
            ]);
        } catch (GuzzleException $e) {
            return response()->json([
                "error" => "Failed to fetch versions from Modrinth.",
                "message" => $e->getMessage(),
            ], 502);
        }
    }

    /**
     * Get modpack categories from Modrinth.
     * GET /api/client/servers/{server}/modpacks/categories
     */
    public function categories(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            $response = $this->httpClient->get("tag/category");
            if ($response->getStatusCode() !== 200) {
                return response()->json(["error" => "Failed to fetch categories."], 502);
            }

            $allCats = json_decode($response->getBody()->getContents(), true);
            $modpackCats = [];
            if (is_array($allCats)) {
                foreach ($allCats as $cat) {
                    if (($cat["project_type"] ?? "") === "modpack") {
                        $modpackCats[] = [
                            "name" => $cat["name"] ?? "",
                            "icon" => $cat["icon"] ?? "",
                            "header" => $cat["header"] ?? "",
                        ];
                    }
                }
            }

            return response()->json([
                "success" => true,
                "categories" => $modpackCats,
            ]);
        } catch (GuzzleException $e) {
            return response()->json([
                "error" => "Failed to fetch categories from Modrinth.",
                "message" => $e->getMessage(),
            ], 502);
        }
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

            if (is_array($manifest) && !empty($manifest["project_id"])) {
                return response()->json([
                    "success" => true,
                    "has_modpack" => true,
                    "manifest" => $manifest,
                ]);
            }
        } catch (Exception $e) {
            // Manifest not found or empty
        }

        return response()->json([
            "success" => true,
            "has_modpack" => false,
            "manifest" => null,
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

        $versionId = trim((string) $request->input("version_id", ""));
        $wipeMode = trim((string) $request->input("wipe_mode", "mods_and_configs")); // "mods_and_configs", "full_server", "none"

        if (empty($versionId) || !preg_match("/^[a-zA-Z0-9_-]+$/", $versionId)) {
            return response()->json(["error" => "Valid version ID is required."], 400);
        }

        try {
            // 1. Fetch version info from Modrinth
            $verRes = $this->httpClient->get("version/{$versionId}");
            if ($verRes->getStatusCode() !== 200) {
                return response()->json(["error" => "Failed to fetch version metadata from Modrinth."], 502);
            }

            $verData = json_decode($verRes->getBody()->getContents(), true);
            $files = $verData["files"] ?? [];

            $mrpackUrl = null;
            foreach ($files as $f) {
                $fn = strtolower($f["filename"] ?? "");
                if (str_ends_with($fn, ".mrpack")) {
                    $mrpackUrl = $f["url"] ?? null;
                    break;
                }
            }

            if (!$mrpackUrl && !empty($files[0]["url"])) {
                $mrpackUrl = $files[0]["url"];
            }

            if (!$mrpackUrl || !filter_var($mrpackUrl, FILTER_VALIDATE_URL)) {
                return response()->json(["error" => "No valid modpack archive (.mrpack) found for this version."], 400);
            }

            // 2. Download .mrpack to a temporary file
            $tempPack = tempnam(sys_get_temp_dir(), "ptero_mrpack_");
            $client = new Client(["timeout" => 60.0, "http_errors" => false]);
            $packRes = $client->get($mrpackUrl, ["sink" => $tempPack]);

            if ($packRes->getStatusCode() !== 200) {
                @unlink($tempPack);
                return response()->json(["error" => "Failed to download .mrpack file."], 502);
            }

            // 3. Open .mrpack with ZipArchive
            $zip = new ZipArchive();
            $zipOpenRes = $zip->open($tempPack);
            if ($zipOpenRes !== true) {
                @unlink($tempPack);
                return response()->json(["error" => "Failed to open .mrpack archive."], 500);
            }

            // 4. Read modrinth.index.json
            $indexContent = $zip->getFromName("modrinth.index.json");
            if ($indexContent === false) {
                $zip->close();
                @unlink($tempPack);
                return response()->json(["error" => "Archive does not contain modrinth.index.json."], 400);
            }

            $index = json_decode($indexContent, true);
            if (!is_array($index)) {
                $zip->close();
                @unlink($tempPack);
                return response()->json(["error" => "Failed to parse modrinth.index.json."], 400);
            }

            // 5. Handle Wipe if requested
            if ($wipeMode === "full_server") {
                if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
                    $zip->close();
                    @unlink($tempPack);
                    return response()->json(["error" => "Permission denied to wipe server files."], 403);
                }
                try {
                    $rootItems = $this->fileRepository->setServer($server)->getDirectory("/");
                    if (is_array($rootItems)) {
                        $toDelete = [];
                        foreach ($rootItems as $it) {
                            $name = $it["name"] ?? "";
                            if (!empty($name) && $name !== "." && $name !== "..") {
                                $toDelete[] = $name;
                            }
                        }
                        if (!empty($toDelete)) {
                            $this->fileRepository->setServer($server)->deleteFiles("/", $toDelete);
                        }
                    }
                } catch (Exception $e) {}
            } elseif ($wipeMode === "mods_and_configs") {
                if ($request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
                    try {
                        $this->fileRepository->setServer($server)->deleteFiles("/", ["mods", "config", "defaultconfigs"]);
                    } catch (Exception $e) {}
                }
            }

            // 6. Extract overrides to server
            // Modpacks have overrides/ or server-overrides/ with config files
            $overrideEntries = [];
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $stat = $zip->statIndex($i);
                $entryName = $stat["name"] ?? "";
                if (empty($entryName) || str_ends_with($entryName, "/")) {
                    continue;
                }

                $targetPath = null;
                if (str_starts_with($entryName, "overrides/")) {
                    $targetPath = "/" . substr($entryName, strlen("overrides/"));
                } elseif (str_starts_with($entryName, "server-overrides/")) {
                    $targetPath = "/" . substr($entryName, strlen("server-overrides/"));
                }

                if ($targetPath && $stat["size"] < 5000000) { // Limit individual config file to 5MB
                    $fileData = $zip->getFromIndex($i);
                    if ($fileData !== false) {
                        try {
                            $this->fileRepository->setServer($server)->putContent($targetPath, $fileData);
                            $overrideEntries[] = $targetPath;
                        } catch (Exception $e) {
                            // If putContent fails, proceed with other files
                        }
                    }
                }
            }

            $zip->close();
            @unlink($tempPack);

            // 7. Filter Server-Compatible Mods
            $rawFiles = $index["files"] ?? [];
            $modsToInstall = [];

            foreach ($rawFiles as $item) {
                // Check server environment flag
                $serverEnv = $item["env"]["server"] ?? "required";
                if ($serverEnv === "unsupported") {
                    // Client-only mod, skip for server
                    continue;
                }

                $path = $item["path"] ?? "";
                $downloads = $item["downloads"] ?? [];
                if (empty($path) || empty($downloads)) {
                    continue;
                }

                $primaryDownload = $downloads[0];
                $cleanPath = ltrim(str_replace("\\", "/", $path), "/");
                $fileName = basename($cleanPath);
                $dir = dirname($cleanPath);
                if ($dir === "." || empty($dir)) {
                    $dir = "mods";
                }

                $modsToInstall[] = [
                    "name" => $fileName,
                    "path" => $cleanPath,
                    "directory" => "/" . $dir,
                    "filename" => $fileName,
                    "url" => $primaryDownload,
                    "size" => (int) ($item["fileSize"] ?? 0),
                ];
            }

            $dependencies = $index["dependencies"] ?? [];

            return response()->json([
                "success" => true,
                "version_id" => $versionId,
                "game_version" => $dependencies["minecraft"] ?? "Unknown",
                "loader" => isset($dependencies["fabric-loader"]) ? "fabric"
                    : (isset($dependencies["forge"]) ? "forge"
                    : (isset($dependencies["neoforge"]) ? "neoforge"
                    : (isset($dependencies["quilt-loader"]) ? "quilt" : "modded"))),
                "total_files" => count($modsToInstall),
                "files" => $modsToInstall,
                "overrides_extracted" => count($overrideEntries),
            ]);
        } catch (Exception $e) {
            return response()->json([
                "error" => "Failed to prepare modpack.",
                "message" => $e->getMessage(),
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

        $files = $request->input("files", []);
        if (!is_array($files) || empty($files)) {
            return response()->json(["error" => "No files provided in batch."], 400);
        }

        $installed = [];
        $errors = [];

        foreach ($files as $file) {
            $url = $file["url"] ?? "";
            $directory = $file["directory"] ?? "/mods";
            $filename = $file["filename"] ?? "";

            // Validate HTTPS and valid filename
            if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL) || !str_starts_with($url, "https://")) {
                $errors[] = ["file" => $filename, "error" => "Invalid URL"];
                continue;
            }

            $cleanFilename = basename(str_replace(["\\", "/", "\0"], "", $filename));
            if (empty($cleanFilename)) {
                $cleanFilename = "mod.jar";
            }

            try {
                $this->fileRepository->setServer($server)->pull(
                    $url,
                    $directory,
                    [
                        "filename" => $cleanFilename,
                        "use_header" => true,
                        "foreground" => true,
                    ]
                );
                $installed[] = $cleanFilename;
            } catch (Exception $e) {
                $errors[] = ["file" => $cleanFilename, "error" => $e->getMessage()];
            }
        }

        return response()->json([
            "success" => true,
            "installed_count" => count($installed),
            "installed_files" => $installed,
            "errors" => $errors,
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
            "project_id" => (string) $request->input("project_id", ""),
            "title" => (string) $request->input("title", "Minecraft Modpack"),
            "version_id" => (string) $request->input("version_id", ""),
            "version_name" => (string) $request->input("version_name", ""),
            "loader" => (string) $request->input("loader", "modded"),
            "minecraft" => (string) $request->input("minecraft", ""),
            "icon_url" => (string) $request->input("icon_url", ""),
            "installed_at" => date("c"),
            "total_mods" => (int) $request->input("total_mods", 0),
            "installed_files" => $request->input("installed_files", []),
        ];

        try {
            $this->fileRepository->setServer($server)->putContent(
                self::MANIFEST_FILE,
                json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            );

            return response()->json([
                "success" => true,
                "message" => "Modpack successfully finalized!",
                "manifest" => $manifest,
            ]);
        } catch (Exception $e) {
            return response()->json([
                "error" => "Failed to write modpack manifest file.",
                "message" => $e->getMessage(),
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

        $wipeModsDir = (bool) $request->input("wipe_mods", true);

        try {
            // Delete manifest file
            try {
                $this->fileRepository->setServer($server)->deleteFiles("/", [ltrim(self::MANIFEST_FILE, "/")]);
            } catch (Exception $e) {}

            // Wipe mods directory if requested
            if ($wipeModsDir) {
                try {
                    $modFiles = $this->fileRepository->setServer($server)->getDirectory("/mods");
                    if (is_array($modFiles)) {
                        $toDelete = [];
                        foreach ($modFiles as $mf) {
                            $name = $mf["name"] ?? "";
                            if (!empty($name) && $name !== "." && $name !== "..") {
                                $toDelete[] = $name;
                            }
                        }
                        if (!empty($toDelete)) {
                            $this->fileRepository->setServer($server)->deleteFiles("/mods", $toDelete);
                        }
                    }
                } catch (Exception $e) {}
            }

            return response()->json([
                "success" => true,
                "message" => "Modpack removed successfully.",
            ]);
        } catch (Exception $e) {
            return response()->json([
                "error" => "Failed to uninstall modpack.",
                "message" => $e->getMessage(),
            ], 500);
        }
    }
}
