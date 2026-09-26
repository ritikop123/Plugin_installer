<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

if (!function_exists('str_starts_with')) {
    function str_starts_with(?string $haystack, ?string $needle): bool {
        return (string)$needle !== '' && strncmp((string)$haystack, (string)$needle, strlen((string)$needle)) === 0;
    }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with(?string $haystack, ?string $needle): bool {
        $needle = (string)$needle;
        $haystack = (string)$haystack;
        return $needle === '' || $needle === substr($haystack, -strlen($needle));
    }
}
if (!function_exists('str_contains')) {
    function str_contains(?string $haystack, ?string $needle): bool {
        return (string)$needle !== '' && strpos((string)$haystack, (string)$needle) !== false;
    }
}

class OptionsController extends ClientApiController
{
    public const MANIFEST_FILE = '/.pterodactyl-software.json';
    public const DEFAULT_ICON_BASE64 = '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';
    public const DEFAULT_MOTD = 'Server Hosting at §b§n§lSagarmatha Hosting';

    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
    }

    /**
     * Get server options, properties, allocation address, detected software, and server icon.
     * GET /api/client/servers/{server}/options
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        try {
            // 1. Detect server software & category
            $software = $this->detectServerSoftware($server);
            $category = $software['category'] ?? 'java';
            $configFile = $software['config_file'] ?? '/server.properties';

            // 2. Resolve Server Allocation Address (Primary IP/Domain & Port)
            $address = '';
            $port = ($category === 'bedrock') ? 19132 : 25565;
            $allocation = $server->allocation;
            if ($allocation) {
                $host = !empty($allocation->alias) ? $allocation->alias : $allocation->ip;
                $port = (int) $allocation->port;
                $address = $host . ':' . $port;
            }

            // 3. Read config properties
            $properties = [];
            $fileExists = false;
            try {
                $raw = $this->fileRepository->setServer($server)->getContent($configFile);
                $fileExists = true;
                $lines = explode("\n", str_replace("\r\n", "\n", $raw));
                foreach ($lines as $line) {
                    $trimmed = trim($line);
                    if (empty($trimmed) || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '!')) {
                        continue;
                    }
                    if (str_contains($line, '=')) {
                        $parts = explode('=', $line, 2);
                        $properties[trim($parts[0])] = trim($parts[1]);
                    } elseif (str_contains($line, ':')) {
                        $parts = explode(':', $line, 2);
                        $properties[trim($parts[0])] = trim(trim($parts[1]), '"\'');
                    }
                }
            } catch (Throwable $e) {
                // Fallback to /server.properties if dedicated config missing
                if ($configFile !== '/server.properties') {
                    try {
                        $raw = $this->fileRepository->setServer($server)->getContent('/server.properties');
                        $fileExists = true;
                        $lines = explode("\n", str_replace("\r\n", "\n", $raw));
                        foreach ($lines as $line) {
                            $trimmed = trim($line);
                            if (empty($trimmed) || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '!')) continue;
                            $parts = explode('=', $line, 2);
                            if (count($parts) === 2) {
                                $properties[trim($parts[0])] = trim($parts[1]);
                            }
                        }
                    } catch (Throwable $ex) {
                        $fileExists = false;
                    }
                }
            }

            // 4. Map Bedrock / Proxy MOTD & Settings
            if ($category === 'bedrock') {
                if (!empty($properties['server-name']) && empty($properties['motd'])) {
                    $properties['motd'] = $properties['server-name'];
                } elseif (!empty($properties['motd']) && empty($properties['server-name'])) {
                    $properties['server-name'] = $properties['motd'];
                }
            } elseif ($category === 'proxy') {
                if (!empty($properties['show-max-players']) && empty($properties['max-players'])) {
                    $properties['max-players'] = $properties['show-max-players'];
                }
            }

            // 5. Ensure Default MOTD if not set or default vanilla
            $motd = $properties['motd'] ?? '';
            if (empty($motd) || $motd === 'A Minecraft Server' || $motd === 'Dedicated Server') {
                $properties['motd'] = self::DEFAULT_MOTD;
            }

            // 6. Check for server-icon.png (64x64 PNG)
            $hasCustomIcon = false;
            $iconData = 'data:image/png;base64,' . self::DEFAULT_ICON_BASE64;
            try {
                $iconBytes = $this->fileRepository->setServer($server)->getContent('/server-icon.png');
                if (!empty($iconBytes)) {
                    $b64 = base64_encode($iconBytes);
                    $hasCustomIcon = ($b64 !== self::DEFAULT_ICON_BASE64);
                    $iconData = 'data:image/png;base64,' . $b64;
                } else {
                    $defaultBytes = base64_decode(self::DEFAULT_ICON_BASE64);
                    $this->fileRepository->setServer($server)->putContent('/server-icon.png', $defaultBytes);
                }
            } catch (Throwable $e) {
                try {
                    $defaultBytes = base64_decode(self::DEFAULT_ICON_BASE64);
                    $this->fileRepository->setServer($server)->putContent('/server-icon.png', $defaultBytes);
                } catch (Throwable $ex) {}
            }

            return response()->json([
                'success' => true,
                'software' => $software,
                'address' => $address,
                'port' => $port,
                'server_name' => $server->name,
                'server_description' => $server->description ?? '',
                'has_custom_icon' => $hasCustomIcon,
                'icon_data' => $iconData,
                'default_icon' => 'data:image/png;base64,' . self::DEFAULT_ICON_BASE64,
                'default_motd' => self::DEFAULT_MOTD,
                'file_exists' => $fileExists,
                'properties' => $properties,
                'expire_at' => !empty($server->expire_at) ? (is_string($server->expire_at) ? $server->expire_at : $server->expire_at->toIso8601String()) : null,
                'is_suspended' => $server->isSuspended(),
                'plan_name' => $server->plan_name ?? null,
                'plan_price' => $server->plan_price ?? null,
            ]);
        } catch (Throwable $e) {
            Log::error('[OptionsController] index error: ' . $e->getMessage());
            return response()->json([
                'success' => true,
                'software' => ['id' => 'CUSTOM', 'name' => 'Minecraft Server', 'category' => 'java'],
                'address' => '',
                'port' => 25565,
                'server_name' => $server->name,
                'server_description' => $server->description ?? '',
                'has_custom_icon' => false,
                'icon_data' => 'data:image/png;base64,' . self::DEFAULT_ICON_BASE64,
                'default_icon' => 'data:image/png;base64,' . self::DEFAULT_ICON_BASE64,
                'default_motd' => self::DEFAULT_MOTD,
                'file_exists' => false,
                'properties' => [],
                'expire_at' => null,
                'is_suspended' => $server->isSuspended(),
                'plan_name' => null,
                'plan_price' => null,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Get server subscription details (Arix Theme subscription widget / billing integration).
     * GET /api/client/servers/{server}/subscription
     */
    public function subscription(Request $request, Server $server): JsonResponse
    {
        return response()->json([
            'data' => [
                'status' => $server->isSuspended() ? 'suspended' : 'active',
                'expires_at' => !empty($server->expire_at) ? (is_string($server->expire_at) ? $server->expire_at : $server->expire_at->toIso8601String()) : null,
                'product' => $server->plan_name ?: 'N/A',
                'price' => [
                    'amount' => $server->plan_price ?: 'N/A',
                    'currency' => '',
                ],
                'serviceLink' => '',
                'invoice' => [
                    'pending' => false,
                ],
            ],
        ]);
    }

    /**
     * Update server properties / config (Auto-Save).
     * POST /api/client/servers/{server}/options
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        $software = $this->detectServerSoftware($server);
        $category = $software['category'] ?? 'java';
        $configFile = $software['config_file'] ?? '/server.properties';

        $newProps = $request->input('properties', []);
        if (!is_array($newProps)) {
            return response()->json(['error' => 'Properties must be an object of key-value pairs.'], 400);
        }

        // Bedrock BDS: sync motd to server-name
        if ($category === 'bedrock') {
            if (isset($newProps['motd'])) {
                $newProps['server-name'] = $newProps['motd'];
            } elseif (isset($newProps['server-name'])) {
                $newProps['motd'] = $newProps['server-name'];
            }
        }

        // Read existing content to preserve comments and layout
        $existingLines = [];
        try {
            $content = $this->fileRepository->setServer($server)->getContent($configFile);
            $existingLines = explode("\n", str_replace("\r\n", "\n", $content));
        } catch (Throwable $e) {
            $existingLines = [
                '# Minecraft server properties',
                '#' . date('D M d H:i:s T Y'),
            ];
        }

        $updatedLines = [];
        $keysProcessed = [];

        foreach ($existingLines as $line) {
            $trimmed = trim($line);
            if (empty($trimmed) || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '!')) {
                $updatedLines[] = $line;
                continue;
            }

            if (str_contains($line, '=')) {
                $parts = explode('=', $line, 2);
                $key = trim($parts[0]);
                if (array_key_exists($key, $newProps)) {
                    $val = $newProps[$key];
                    if (is_bool($val)) {
                        $val = $val ? 'true' : 'false';
                    }
                    $updatedLines[] = $key . '=' . $val;
                    $keysProcessed[$key] = true;
                } else {
                    $updatedLines[] = $line;
                }
            } elseif (str_contains($line, ':')) {
                $parts = explode(':', $line, 2);
                $key = trim($parts[0]);
                if (array_key_exists($key, $newProps)) {
                    $val = $newProps[$key];
                    if (is_bool($val)) {
                        $val = $val ? 'true' : 'false';
                    }
                    $updatedLines[] = $key . ': ' . $val;
                    $keysProcessed[$key] = true;
                } else {
                    $updatedLines[] = $line;
                }
            } else {
                $updatedLines[] = $line;
            }
        }

        // Append any new properties that were not present in existing file
        foreach ($newProps as $key => $val) {
            if (!isset($keysProcessed[$key])) {
                if (is_bool($val)) {
                    $val = $val ? 'true' : 'false';
                }
                $delimiter = ($configFile === '/config.yml' || str_ends_with($configFile, '.yml')) ? ': ' : '=';
                $updatedLines[] = $key . $delimiter . $val;
            }
        }

        $newContent = implode("\n", $updatedLines);

        try {
            $this->fileRepository->setServer($server)->putContent($configFile, $newContent);
            return response()->json([
                'success' => true,
                'software' => $software,
                'message' => 'Server options saved successfully.',
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => "Failed to save {$configFile}.",
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload custom /server-icon.png.
     * POST /api/client/servers/{server}/options/icon
     */
    public function uploadIcon(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        $pngBytes = null;

        // Check if raw base64 was sent
        if ($request->has('icon_data')) {
            $rawBase64 = (string) $request->input('icon_data', '');
            if (preg_match('/^data:image\\/(\\w+);base64,/', $rawBase64)) {
                $rawBase64 = substr($rawBase64, strpos($rawBase64, ',') + 1);
            }
            $decoded = base64_decode($rawBase64, true);
            if ($decoded !== false) {
                $pngBytes = $decoded;
            }
        } elseif ($request->hasFile('icon')) {
            $file = $request->file('icon');
            if ($file->isValid()) {
                $pngBytes = file_get_contents($file->getRealPath());
            }
        }

        if (empty($pngBytes)) {
            return response()->json(['error' => 'No valid image data provided.'], 400);
        }

        // Validate PNG header (Minecraft strictly requires 64x64 PNG)
        if (strlen($pngBytes) < 8 || substr($pngBytes, 0, 8) !== "\x89PNG\r\n\x1a\n") {
            if (extension_loaded('gd') && function_exists('imagecreatefromstring')) {
                $img = @imagecreatefromstring($pngBytes);
                if ($img !== false) {
                    $resized = imagecreatetruecolor(64, 64);
                    imagealphablending($resized, false);
                    imagesavealpha($resized, true);
                    $w = imagesx($img);
                    $h = imagesy($img);
                    imagecopyresampled($resized, $img, 0, 0, 0, 0, 64, 64, $w, $h);
                    ob_start();
                    imagepng($resized);
                    $pngBytes = ob_get_clean();
                    imagedestroy($img);
                    imagedestroy($resized);
                } else {
                    return response()->json(['error' => 'Uploaded file is not a valid image format.'], 400);
                }
            } else {
                return response()->json(['error' => 'Server icon must be a valid PNG image format.'], 400);
            }
        }

        // Verify 64x64 dimensions if GD is available
        if (extension_loaded('gd') && function_exists('imagecreatefromstring')) {
            $img = @imagecreatefromstring($pngBytes);
            if ($img !== false) {
                $w = imagesx($img);
                $h = imagesy($img);
                if ($w !== 64 || $h !== 64) {
                    $resized = imagecreatetruecolor(64, 64);
                    imagealphablending($resized, false);
                    imagesavealpha($resized, true);
                    imagecopyresampled($resized, $img, 0, 0, 0, 0, 64, 64, $w, $h);
                    ob_start();
                    imagepng($resized);
                    $pngBytes = ob_get_clean();
                    imagedestroy($resized);
                }
                imagedestroy($img);
            }
        }

        try {
            $this->fileRepository->setServer($server)->putContent('/server-icon.png', $pngBytes);
            return response()->json([
                'success' => true,
                'message' => 'Server icon updated successfully. Please restart your server to display the new icon.',
                'has_custom_icon' => true,
                'icon_data' => 'data:image/png;base64,' . base64_encode($pngBytes),
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to save /server-icon.png.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Reset /server-icon.png to Sagarmatha default 64x64 logo.
     * DELETE /api/client/servers/{server}/options/icon
     */
    public function deleteIcon(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        try {
            $defaultBytes = base64_decode(self::DEFAULT_ICON_BASE64);
            $this->fileRepository->setServer($server)->putContent('/server-icon.png', $defaultBytes);
            return response()->json([
                'success' => true,
                'message' => 'Custom server icon removed. Default Sagarmatha icon restored.',
                'has_custom_icon' => false,
                'icon_data' => 'data:image/png;base64,' . self::DEFAULT_ICON_BASE64,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to reset server icon.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload and configure resource pack (.zip) for the server.
     * POST /api/client/servers/{server}/options/resourcepack
     */
    public function uploadResourcePack(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_CREATE, $server)) {
            throw new AuthorizationException();
        }

        if (!$request->hasFile('file') && !$request->hasFile('resourcepack')) {
            return response()->json(['error' => 'No resource pack (.zip) file was uploaded.'], 400);
        }

        $file = $request->file('file') ?: $request->file('resourcepack');
        if (!$file->isValid()) {
            return response()->json(['error' => 'Uploaded resource pack file is invalid.'], 400);
        }

        $ext = strtolower($file->getClientOriginalExtension());
        if ($ext !== 'zip') {
            return response()->json(['error' => 'Resource pack must be a valid .zip file.'], 400);
        }

        $publicDir = public_path('resourcepacks');
        if (!is_dir($publicDir)) {
            @mkdir($publicDir, 0755, true);
        }

        $targetName = $server->uuid . '.zip';
        $targetPath = $publicDir . DIRECTORY_SEPARATOR . $targetName;

        $file->move($publicDir, $targetName);

        $sha1 = sha1_file($targetPath);
        $baseUrl = config('app.url') ?: $request->getSchemeAndHttpHost();
        $baseUrl = rtrim($baseUrl, '/');
        $publicUrl = $baseUrl . '/resourcepacks/' . $targetName;

        // Auto-save resource-pack and resource-pack-sha1 to server.properties
        try {
            $raw = '';
            try {
                $raw = $this->fileRepository->setServer($server)->getContent('/server.properties');
            } catch (Throwable $e) {
                $raw = "#Minecraft server properties\n#" . date('D M d H:i:s T Y') . "\n";
            }

            $lines = explode("\n", str_replace("\r\n", "\n", $raw));
            $updatedLines = [];
            $hasPack = false;
            $hasSha1 = false;

            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (str_starts_with($trimmed, 'resource-pack=')) {
                    $updatedLines[] = 'resource-pack=' . $publicUrl;
                    $hasPack = true;
                } elseif (str_starts_with($trimmed, 'resource-pack-sha1=')) {
                    $updatedLines[] = 'resource-pack-sha1=' . $sha1;
                    $hasSha1 = true;
                } else {
                    $updatedLines[] = $line;
                }
            }

            if (!$hasPack) {
                $updatedLines[] = 'resource-pack=' . $publicUrl;
            }
            if (!$hasSha1) {
                $updatedLines[] = 'resource-pack-sha1=' . $sha1;
            }

            $this->fileRepository->setServer($server)->putContent('/server.properties', implode("\n", $updatedLines));
        } catch (Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Resource pack uploaded and configured in server.properties successfully!',
            'url' => $publicUrl,
            'sha1' => $sha1,
        ]);
    }

    /**
     * Remove uploaded resource pack and clear from server.properties.
     * DELETE /api/client/servers/{server}/options/resourcepack
     */
    public function deleteResourcePack(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        $publicDir = public_path('resourcepacks');
        $targetPath = $publicDir . DIRECTORY_SEPARATOR . $server->uuid . '.zip';
        if (file_exists($targetPath)) {
            @unlink($targetPath);
        }

        try {
            $raw = $this->fileRepository->setServer($server)->getContent('/server.properties');
            $lines = explode("\n", str_replace("\r\n", "\n", $raw));
            $updatedLines = [];
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (str_starts_with($trimmed, 'resource-pack=')) {
                    $updatedLines[] = 'resource-pack=';
                } elseif (str_starts_with($trimmed, 'resource-pack-sha1=')) {
                    $updatedLines[] = 'resource-pack-sha1=';
                } else {
                    $updatedLines[] = $line;
                }
            }
            $this->fileRepository->setServer($server)->putContent('/server.properties', implode("\n", $updatedLines));
        } catch (Throwable $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Resource pack removed successfully.',
        ]);
    }

    /**
     * Detect installed server software across all Minecraft editions (Java, Bedrock, Proxies).
     */
    public function detectServerSoftware(Server $server): array
    {
        // 1. Check software manifest (written by SoftwareInstaller)
        try {
            $rawManifest = $this->fileRepository->setServer($server)->getContent(self::MANIFEST_FILE);
            $manifest = json_decode($rawManifest, true);
            if (is_array($manifest) && !empty($manifest['software'])) {
                $softId = strtoupper($manifest['software']);
                $category = 'java';
                if (in_array($softId, ['BDS', 'BEDROCK', 'POCKETMINE', 'NUKKIT', 'POWERNUKKIT'])) {
                    $category = 'bedrock';
                } elseif (in_array($softId, ['BUNGEECORD', 'WATERFALL', 'VELOCITY', 'HEXACORD'])) {
                    $category = 'proxy';
                }
                return [
                    'id' => $softId,
                    'name' => $manifest['software_name'] ?? ucfirst(strtolower($softId)),
                    'category' => $category,
                    'version' => $manifest['version'] ?? null,
                    'build' => $manifest['build'] ?? null,
                    'supports_plugins' => in_array($softId, ['PAPER', 'PURPUR', 'SPIGOT', 'BUKKIT', 'FOLIA', 'POCKETMINE', 'NUKKIT', 'BUNGEECORD', 'VELOCITY', 'WATERFALL']),
                    'supports_mods' => in_array($softId, ['FORGE', 'NEOFORGE', 'FABRIC', 'QUILT', 'MOHIST', 'MAGMA', 'ARCLIGHT', 'CATSERVER']),
                    'config_file' => in_array($softId, ['BUNGEECORD', 'WATERFALL']) ? '/config.yml' : ($softId === 'VELOCITY' ? '/velocity.toml' : '/server.properties'),
                    'source' => 'manifest',
                ];
            }
        } catch (Throwable $e) {}

        // 2. Check Bedrock Dedicated Server (BDS)
        try {
            $isBds = false;
            try {
                $hasBedrockBin = $this->fileRepository->setServer($server)->getContent('/bedrock_server');
                if ($hasBedrockBin !== null) $isBds = true;
            } catch (Throwable $e) {}
            if (!$isBds) {
                try {
                    $hasAllowlist = $this->fileRepository->setServer($server)->getContent('/allowlist.json');
                    $hasPermissions = $this->fileRepository->setServer($server)->getContent('/permissions.json');
                    if ($hasAllowlist !== null || $hasPermissions !== null) $isBds = true;
                } catch (Throwable $e) {}
            }
            if ($isBds) {
                return [
                    'id' => 'BDS',
                    'name' => 'Bedrock Dedicated Server',
                    'category' => 'bedrock',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => false,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'bedrock_server',
                ];
            }
        } catch (Throwable $e) {}

        // 3. Check PocketMine-MP
        try {
            $hasPocketmine = false;
            try {
                $pm = $this->fileRepository->setServer($server)->getContent('/pocketmine.yml');
                if ($pm !== null) $hasPocketmine = true;
            } catch (Throwable $e) {}
            if ($hasPocketmine) {
                return [
                    'id' => 'POCKETMINE',
                    'name' => 'PocketMine-MP',
                    'category' => 'bedrock',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/pocketmine.yml',
                    'source' => 'pocketmine.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 4. Check Nukkit / PowerNukkit
        try {
            $hasNukkit = false;
            try {
                $nk = $this->fileRepository->setServer($server)->getContent('/nukkit.yml');
                if ($nk !== null) $hasNukkit = true;
            } catch (Throwable $e) {}
            if ($hasNukkit) {
                return [
                    'id' => 'NUKKIT',
                    'name' => 'Nukkit',
                    'category' => 'bedrock',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/nukkit.yml',
                    'source' => 'nukkit.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 5. Check Velocity Proxy
        try {
            $hasVelocity = false;
            try {
                $vel = $this->fileRepository->setServer($server)->getContent('/velocity.toml');
                if ($vel !== null) $hasVelocity = true;
            } catch (Throwable $e) {}
            if ($hasVelocity) {
                return [
                    'id' => 'VELOCITY',
                    'name' => 'Velocity',
                    'category' => 'proxy',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/velocity.toml',
                    'source' => 'velocity.toml',
                ];
            }
        } catch (Throwable $e) {}

        // 6. Check BungeeCord / Waterfall Proxy
        try {
            $hasBungee = false;
            try {
                $bng = $this->fileRepository->setServer($server)->getContent('/config.yml');
                if ($bng !== null && (str_contains($bng, 'listeners:') || str_contains($bng, 'ip_forward:'))) {
                    $hasBungee = true;
                }
            } catch (Throwable $e) {}
            if ($hasBungee) {
                return [
                    'id' => 'BUNGEECORD',
                    'name' => 'BungeeCord / Waterfall',
                    'category' => 'proxy',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/config.yml',
                    'source' => 'config.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 7. Check version_history.json (Paper / Purpur / Spigot / Folia)
        try {
            $rawHistory = $this->fileRepository->setServer($server)->getContent('/version_history.json');
            $history = json_decode($rawHistory, true);
            if (is_array($history) && !empty($history['currentVersion'])) {
                $raw = (string) $history['currentVersion'];
                $softName = 'Paper';
                $build = null;
                $mcVer = null;

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
                    'id' => strtoupper($softName),
                    'name' => $softName,
                    'category' => 'java',
                    'version' => $mcVer,
                    'build' => $build,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'version_history.json',
                ];
            }
        } catch (Throwable $e) {}

        // 8. Check Purpur / Paper / Spigot / Folia YAML files
        try {
            $isPurpur = false;
            try {
                $py = $this->fileRepository->setServer($server)->getContent('/purpur.yml');
                if ($py !== null) $isPurpur = true;
            } catch (Throwable $e) {}
            if ($isPurpur) {
                return [
                    'id' => 'PURPUR',
                    'name' => 'Purpur',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'purpur.yml',
                ];
            }

            $isPaper = false;
            try {
                $pay = $this->fileRepository->setServer($server)->getContent('/paper.yml');
                if ($pay !== null) $isPaper = true;
            } catch (Throwable $e) {}
            if (!$isPaper) {
                try {
                    $pay = $this->fileRepository->setServer($server)->getContent('/config/paper-global.yml');
                    if ($pay !== null) $isPaper = true;
                } catch (Throwable $e) {}
            }
            if ($isPaper) {
                return [
                    'id' => 'PAPER',
                    'name' => 'Paper',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'paper.yml',
                ];
            }

            $isFolia = false;
            try {
                $fy = $this->fileRepository->setServer($server)->getContent('/folia.yml');
                if ($fy !== null) $isFolia = true;
            } catch (Throwable $e) {}
            if ($isFolia) {
                return [
                    'id' => 'FOLIA',
                    'name' => 'Folia',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'folia.yml',
                ];
            }

            $isSpigot = false;
            try {
                $sy = $this->fileRepository->setServer($server)->getContent('/spigot.yml');
                if ($sy !== null) $isSpigot = true;
            } catch (Throwable $e) {}
            if ($isSpigot) {
                return [
                    'id' => 'SPIGOT',
                    'name' => 'Spigot',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => true,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'spigot.yml',
                ];
            }
        } catch (Throwable $e) {}

        // 9. Check Forge / NeoForge / Fabric / Quilt in libraries directory
        try {
            $forgeItems = $this->fileRepository->setServer($server)->getDirectory('/libraries/net/minecraftforge/forge');
            if (is_array($forgeItems) && !empty($forgeItems)) {
                $ver = null;
                $bld = null;
                foreach ($forgeItems as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $parts = explode('-', $n, 2);
                        $ver = $parts[0] ?? $n;
                        $bld = $parts[1] ?? null;
                        break;
                    }
                }
                return [
                    'id' => 'FORGE',
                    'name' => 'Forge',
                    'category' => 'java',
                    'version' => $ver,
                    'build' => $bld,
                    'supports_plugins' => false,
                    'supports_mods' => true,
                    'config_file' => '/server.properties',
                    'source' => 'libraries/forge',
                ];
            }
        } catch (Throwable $e) {}

        try {
            $neoItems = $this->fileRepository->setServer($server)->getDirectory('/libraries/net/neoforged/neoforge');
            if (is_array($neoItems) && !empty($neoItems)) {
                $bld = null;
                foreach ($neoItems as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $bld = $n;
                        break;
                    }
                }
                return [
                    'id' => 'NEOFORGE',
                    'name' => 'NeoForge',
                    'category' => 'java',
                    'version' => null,
                    'build' => $bld,
                    'supports_plugins' => false,
                    'supports_mods' => true,
                    'config_file' => '/server.properties',
                    'source' => 'libraries/neoforge',
                ];
            }
        } catch (Throwable $e) {}

        try {
            $fabricItems = $this->fileRepository->setServer($server)->getDirectory('/libraries/net/fabricmc/fabric-loader');
            if (is_array($fabricItems) && !empty($fabricItems)) {
                $bld = null;
                foreach ($fabricItems as $item) {
                    $n = $item['name'] ?? '';
                    if (!empty($n) && $n !== '.' && $n !== '..') {
                        $bld = $n;
                        break;
                    }
                }
                return [
                    'id' => 'FABRIC',
                    'name' => 'Fabric',
                    'category' => 'java',
                    'version' => null,
                    'build' => $bld,
                    'supports_plugins' => false,
                    'supports_mods' => true,
                    'config_file' => '/server.properties',
                    'source' => 'libraries/fabric',
                ];
            }
        } catch (Throwable $e) {}

        // 10. Check Hybrid servers (Mohist / Magma / Arclight / CatServer)
        try {
            foreach (['mohist.yml' => 'Mohist', 'magma.yml' => 'Magma', 'arclight.conf' => 'Arclight', 'catserver.yml' => 'CatServer'] as $f => $name) {
                try {
                    $c = $this->fileRepository->setServer($server)->getContent("/{$f}");
                    if ($c !== null) {
                        return [
                            'id' => strtoupper($name),
                            'name' => $name,
                            'category' => 'java',
                            'version' => null,
                            'build' => null,
                            'supports_plugins' => true,
                            'supports_mods' => true,
                            'config_file' => '/server.properties',
                            'source' => $f,
                        ];
                    }
                } catch (Throwable $e) {}
            }
        } catch (Throwable $e) {}

        // 11. Check logs/latest.log startup signatures
        try {
            $logContent = $this->fileRepository->setServer($server)->getContent('/logs/latest.log');
            if (!empty($logContent)) {
                $sample = substr($logContent, 0, 16384);
                if (preg_match('/This server is running ([A-Za-z0-9_-]+) version git-\1-(\d+)\s*\(MC:\s*([0-9\.]+)\)/i', $sample, $m)) {
                    $name = ucfirst(strtolower($m[1]));
                    return [
                        'id' => strtoupper($name),
                        'name' => $name,
                        'category' => 'java',
                        'version' => $m[3],
                        'build' => '#' . $m[2],
                        'supports_plugins' => true,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/Loading Minecraft ([0-9\.]+) with Fabric Loader ([0-9\.]+)/i', $sample, $m)) {
                    return [
                        'id' => 'FABRIC',
                        'name' => 'Fabric',
                        'category' => 'java',
                        'version' => $m[1],
                        'build' => $m[2],
                        'supports_plugins' => false,
                        'supports_mods' => true,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/MinecraftForge v([0-9\.]+) Initialized/i', $sample, $m)) {
                    return [
                        'id' => 'FORGE',
                        'name' => 'Forge',
                        'category' => 'java',
                        'version' => null,
                        'build' => $m[1],
                        'supports_plugins' => false,
                        'supports_mods' => true,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/Starting Bedrock Dedicated Server/i', $sample) || preg_match('/IPv4 supported/i', $sample)) {
                    return [
                        'id' => 'BDS',
                        'name' => 'Bedrock Dedicated Server',
                        'category' => 'bedrock',
                        'version' => null,
                        'build' => null,
                        'supports_plugins' => false,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
                if (preg_match('/Starting minecraft server version ([0-9\.]+)/i', $sample, $m)) {
                    return [
                        'id' => 'VANILLA',
                        'name' => 'Vanilla Minecraft',
                        'category' => 'java',
                        'version' => $m[1],
                        'build' => null,
                        'supports_plugins' => false,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'logs/latest.log',
                    ];
                }
            }
        } catch (Throwable $e) {}

        // 12. Check if server.properties exists
        try {
            $props = $this->fileRepository->setServer($server)->getContent('/server.properties');
            if (!empty($props)) {
                if (str_contains($props, 'server-portv6') || str_contains($props, 'allow-cheats')) {
                    return [
                        'id' => 'BDS',
                        'name' => 'Bedrock Dedicated Server',
                        'category' => 'bedrock',
                        'version' => null,
                        'build' => null,
                        'supports_plugins' => false,
                        'supports_mods' => false,
                        'config_file' => '/server.properties',
                        'source' => 'server.properties',
                    ];
                }
                return [
                    'id' => 'VANILLA',
                    'name' => 'Vanilla Minecraft',
                    'category' => 'java',
                    'version' => null,
                    'build' => null,
                    'supports_plugins' => false,
                    'supports_mods' => false,
                    'config_file' => '/server.properties',
                    'source' => 'server.properties',
                ];
            }
        } catch (Throwable $e) {}

        return [
            'id' => 'CUSTOM',
            'name' => 'Custom Server',
            'category' => 'java',
            'version' => null,
            'build' => null,
            'supports_plugins' => false,
            'supports_mods' => false,
            'config_file' => '/server.properties',
            'source' => 'default',
        ];
    }
}
