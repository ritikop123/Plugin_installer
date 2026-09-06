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

        // 3. Check for server-icon.png (64x64 PNG)
        $hasIcon = false;
        $iconData = null;
        try {
            $iconBytes = $this->fileRepository->setServer($server)->getContent('/server-icon.png');
            if (!empty($iconBytes)) {
                $hasIcon = true;
                $iconData = 'data:image/png;base64,' . base64_encode($iconBytes);
            }
        } catch (Exception $e) {
            $hasIcon = false;
        }

        return response()->json([
            'success' => true,
            'address' => $address,
            'port' => $port,
            'server_name' => $server->name,
            'server_description' => $server->description ?? '',
            'has_icon' => $hasIcon,
            'icon_data' => $iconData,
            'file_exists' => $fileExists,
            'properties' => $properties,
        ]);
    }

    /**
     * Update server.properties.
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
                'message' => 'Server properties saved successfully. Please restart your server to apply changes.',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to save server.properties.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload or update /server-icon.png.
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
        // PNG magic signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
        if (strlen($pngBytes) < 8 || substr($pngBytes, 0, 8) !== "\x89PNG\r\n\x1a\n") {
            // If GD is installed, convert image to PNG
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

        // Verify dimensions if GD is available
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
     * Delete /server-icon.png.
     * DELETE /api/client/servers/{server}/options/icon
     */
    public function deleteIcon(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_FILE_DELETE, $server)) {
            throw new AuthorizationException();
        }

        try {
            $this->fileRepository->setServer($server)->deleteFiles('/', ['server-icon.png']);
            return response()->json([
                'success' => true,
                'message' => 'Server icon removed successfully. Default Minecraft icon will be used.',
            ]);
        } catch (Exception $e) {
            return response()->json([
                'error' => 'Failed to delete server icon.',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
