<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class OptionsController extends ClientApiController
{
    public const DEFAULT_ICON_BASE64 = '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';
    public const DEFAULT_MOTD = 'Server Hosting at §b§n§lSagarmatha Hosting';

    protected DaemonFileRepository $fileRepository;

    public function __construct(DaemonFileRepository $fileRepository)
    {
        parent::__construct();
        $this->fileRepository = $fileRepository;
    }

    /**
     * Get server options, properties, allocation address, and server icon.
     * GET /api/client/servers/{server}/options
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_READ, $server)) {
            throw new AuthorizationException();
        }

        // 1. Resolve Server Allocation Address (Primary IP/Domain & Port)
        $address = '';
        $port = 25565;
        $allocation = $server->allocation;
        if ($allocation) {
            $host = !empty($allocation->alias) ? $allocation->alias : $allocation->ip;
            $port = (int) $allocation->port;
            $address = $host . ':' . $port;
        }

        // 2. Read server.properties
        $properties = [];
        $fileExists = false;
        $raw = '';
        try {
            $raw = $this->fileRepository->setServer($server)->getContent('/server.properties');
            $fileExists = true;
            $lines = explode("\n", str_replace("\r\n", "\n", $raw));
            foreach ($lines as $line) {
                $trimmed = trim($line);
                if (empty($trimmed) || str_starts_with($trimmed, '#') || str_starts_with($trimmed, '!')) {
                    continue;
                }
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $key = trim($parts[0]);
                    $val = trim($parts[1]);
                    $properties[$key] = $val;
                }
            }
        } catch (Exception $e) {
            $fileExists = false;
        }

        // 3. Ensure Default MOTD if not set or default vanilla
        $motd = $properties['motd'] ?? '';
        if (empty($motd) || $motd === 'A Minecraft Server') {
            $properties['motd'] = self::DEFAULT_MOTD;
        }

        // 4. Check for server-icon.png (64x64 PNG)
        // If not exists on server, automatically seed the Sagarmatha default 64x64 icon to root!
        $hasCustomIcon = false;
        $iconData = 'data:image/png;base64,' . self::DEFAULT_ICON_BASE64;
        try {
            $iconBytes = $this->fileRepository->setServer($server)->getContent('/server-icon.png');
            if (!empty($iconBytes)) {
                $b64 = base64_encode($iconBytes);
                // Check if it is the default icon or a user-customized icon
                $hasCustomIcon = ($b64 !== self::DEFAULT_ICON_BASE64);
                $iconData = 'data:image/png;base64,' . $b64;
            } else {
                // Empty file: write default
                $defaultBytes = base64_decode(self::DEFAULT_ICON_BASE64);
                $this->fileRepository->setServer($server)->putContent('/server-icon.png', $defaultBytes);
            }
        } catch (Exception $e) {
            // /server-icon.png does NOT exist on server: automatically write default 64x64 logo to server root
            try {
                $defaultBytes = base64_decode(self::DEFAULT_ICON_BASE64);
                $this->fileRepository->setServer($server)->putContent('/server-icon.png', $defaultBytes);
            } catch (Exception $ex) {}
        }

        return response()->json([
            'success' => true,
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
        ]);
    }

    /**
     * Update server.properties (Auto-Save).
     * POST /api/client/servers/{server}/options
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_UPDATE, $server)) {
            throw new AuthorizationException();
        }

        $newProps = $request->input('properties', []);
        if (!is_array($newProps)) {
            return response()->json(['error' => 'Properties must be an object of key-value pairs.'], 400);
        }

        // Read existing content to preserve comments and layout
        $existingLines = [];
        try {
            $content = $this->fileRepository->setServer($server)->getContent('/server.properties');
            $existingLines = explode("\n", str_replace("\r\n", "\n", $content));
        } catch (Exception $e) {
            $existingLines = [
                '#Minecraft server properties',
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

            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
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
                $updatedLines[] = $key . '=' . $val;
            }
        }

        $newContent = implode("\n", $updatedLines);

        try {
            $this->fileRepository->setServer($server)->putContent('/server.properties', $newContent);
            return response()->json([
                'success' => true,
                'message' => 'Server properties saved successfully.',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to save server.properties.',
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
        } catch (Exception $e) {
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
        } catch (Exception $e) {
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
            } catch (Exception $e) {
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
        } catch (Exception $e) {}

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
        } catch (Exception $e) {}

        return response()->json([
            'success' => true,
            'message' => 'Resource pack removed successfully.',
        ]);
    }
}
