<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Permission;
use Pterodactyl\Repositories\Wings\DaemonPowerRepository;
use Pterodactyl\Repositories\Wings\DaemonFileRepository;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Throwable;

class SmartSleepController extends ClientApiController
{
    public const SETTINGS_FILE = '/.smartsleep.json';

    private DaemonPowerRepository $powerRepository;
    private DaemonFileRepository $fileRepository;

    public function __construct(
        DaemonPowerRepository $powerRepository,
        DaemonFileRepository $fileRepository
    ) {
        parent::__construct();
        $this->powerRepository = $powerRepository;
        $this->fileRepository = $fileRepository;
    }

    /**
     * Get SmartSleep settings & live status for a server.
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $settings = $this->loadSettings($server);

        return response()->json([
            'success' => true,
            'settings' => $settings,
            'server' => [
                'name' => $server->name,
                'memory_limit' => $server->memory,
                'cpu_limit' => $server->cpu,
            ],
        ]);
    }

    /**
     * Update SmartSleep configuration for a server.
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        $this->validate($request, [
            'enabled' => 'required|boolean',
            'timeout' => 'required|integer|min:5|max:240',
            'custom_motd' => 'nullable|string|max:120',
            'bedrock_port' => 'nullable|integer|min:1|max:65535',
        ]);

        $settings = [
            'enabled' => (bool) $request->input('enabled', true),
            'timeout' => (int) $request->input('timeout', 20),
            'custom_motd' => (string) $request->input('custom_motd', ''),
            'bedrock_port' => $request->input('bedrock_port') ? (int) $request->input('bedrock_port') : null,
            'updated_at' => now()->toIso8601String(),
        ];

        try {
            $this->fileRepository->setServer($server)->putContent(
                self::SETTINGS_FILE,
                json_encode($settings, JSON_PRETTY_PRINT)
            );
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to save SmartSleep settings to server: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'SmartSleep settings updated successfully.',
            'settings' => $settings,
        ]);
    }

    /**
     * Trigger a manual wake-up for the server.
     */
    public function wake(Request $request, Server $server): JsonResponse
    {
        if (!$request->user()->can(Permission::ACTION_CONTROL_START, $server)) {
            return response()->json(['error' => 'You do not have permission to start this server.'], 403);
        }

        try {
            $this->powerRepository->setServer($server)->send('start');
        } catch (Throwable $e) {
            return response()->json([
                'error' => 'Failed to send start signal: ' . $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Server wake-up signal sent successfully.',
        ]);
    }

    /**
     * Load settings from .smartsleep.json or fallback to defaults.
     */
    protected function loadSettings(Server $server): array
    {
        $defaults = [
            'enabled' => true,
            'timeout' => 20,
            'custom_motd' => '',
            'bedrock_port' => null,
        ];

        try {
            $content = $this->fileRepository->setServer($server)->getContent(self::SETTINGS_FILE);
            $decoded = json_decode($content, true);
            if (is_array($decoded)) {
                return array_merge($defaults, $decoded);
            }
        } catch (Throwable $e) {}

        return $defaults;
    }
}
