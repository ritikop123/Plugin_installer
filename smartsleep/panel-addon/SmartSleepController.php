<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Throwable;

class SmartSleepController extends ClientApiController
{
    public const SETTINGS_FILE = '/.smartsleep.json';

    public function __construct(private DaemonFileRepository $fileRepository)
    {
        parent::__construct();
    }

    public function index(Request $request, Server $server): JsonResponse
    {
        $lowerName = strtolower($server->name);
        $proxyKeywords = ['velocity', 'bungee', 'waterfall', 'flamecord', 'travertine', 'gate-proxy', 'bungeecord'];
        $isProxy = false;
        foreach ($proxyKeywords as $keyword) {
            if (str_contains($lowerName, $keyword)) {
                $isProxy = true;
                break;
            }
        }

        return response()->json([
            'success' => true,
            'settings' => $this->loadSettings($server),
            'is_proxy' => $isProxy,
            'server' => [
                'name' => $server->name,
                'smartsleep_enabled' => (bool) ($server->smartsleep_enabled ?? true),
            ],
        ]);
    }

    public function update(Request $request, Server $server): JsonResponse
    {
        $this->validate($request, [
            'enabled' => 'required|boolean',
        ]);

        $enabled = (bool) $request->input('enabled');
        $settings = [
            'enabled' => $enabled,
            'updated_at' => now()->toIso8601String(),
        ];

        try {
            if (Schema::hasColumn('servers', 'smartsleep_enabled')) {
                $server->update(['smartsleep_enabled' => $enabled]);
            }
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to save auto-stop setting: ' . $e->getMessage(),
            ], 500);
        }

        try {
            $this->fileRepository->setServer($server)->putContent(
                self::SETTINGS_FILE,
                json_encode($settings, JSON_PRETTY_PRINT)
            );
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to save auto-stop setting to server: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Auto-stop configuration updated successfully.',
            'settings' => $settings,
        ]);
    }

    protected function loadSettings(Server $server): array
    {
        $defaults = [
            'enabled' => (bool) ($server->smartsleep_enabled ?? true),
        ];

        try {
            $content = $this->fileRepository->setServer($server)->getContent(self::SETTINGS_FILE);
            $decoded = json_decode($content, true);
            if (is_array($decoded) && array_key_exists('enabled', $decoded)) {
                $defaults['enabled'] = (bool) $decoded['enabled'];
            }
        } catch (Throwable $e) {
            // The server column remains the fallback when the optional settings file is absent.
        }

        return $defaults;
    }
}
