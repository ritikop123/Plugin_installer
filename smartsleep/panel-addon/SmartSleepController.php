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

        // Check if server is a proxy (Velocity / BungeeCord / Waterfall)
        $isProxy = false;
        $lowerName = strtolower($server->name);
        $proxyKeywords = ['velocity', 'bungee', 'waterfall', 'flamecord', 'travertine', 'gate-proxy', 'bungeecord'];
        foreach ($proxyKeywords as $kw) {
            if (str_contains($lowerName, $kw)) {
                $isProxy = true;
                break;
            }
        }

        $defaultEnabled = true;
        if (isset($server->smartsleep_enabled)) {
            $defaultEnabled = (bool) $server->smartsleep_enabled;
        }

        // Determine if server is currently considered hibernating (query daemon or fallback)
        $isHibernating = false;
        if ($defaultEnabled && !$isProxy && ($settings['enabled'] ?? true)) {
            // 1. Fetch primary port
            $port = null;
            if (!empty($server->allocation_id)) {
                $port = \Illuminate\Support\Facades\DB::table('allocations')->where('id', $server->allocation_id)->value('port');
            }
            if (!$port && !empty($server->id)) {
                $port = \Illuminate\Support\Facades\DB::table('allocations')->where('server_id', $server->id)->value('port');
            }

            // 2. Query SmartSleep daemon IPC status
            $hosts = ['127.0.0.1'];
            if (!empty($server->node_id)) {
                $fqdn = \Illuminate\Support\Facades\DB::table('nodes')->where('id', $server->node_id)->value('fqdn');
                if (!empty($fqdn) && !in_array($fqdn, ['localhost', '127.0.0.1'])) {
                    $hosts[] = $fqdn;
                }
            }

            $daemonQueried = false;
            $shortId = $server->identifier ?? substr($server->uuid, 0, 8);
            $queryUrl = "uuid=" . urlencode($server->uuid) . "&id=" . urlencode($shortId) . ($port ? "&port=" . (int) $port : "");

            foreach ($hosts as $h) {
                try {
                    $ch = curl_init("http://{$h}:8995/status?{$queryUrl}");
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 200);
                    curl_setopt($ch, CURLOPT_TIMEOUT_MS, 400);
                    $resp = curl_exec($ch);
                    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                    curl_close($ch);

                    if ($httpCode === 200 && $resp) {
                        $daemonData = json_decode($resp, true);
                        if (isset($daemonData['is_sleeping'])) {
                            $isHibernating = (bool) $daemonData['is_sleeping'];
                            $daemonQueried = true;
                            break;
                        }
                    }
                } catch (Throwable $e) {}
            }

            // 3. Fallback to Wings container status if daemon could not be reached
            if (!$daemonQueried) {
                try {
                    $status = $this->powerRepository->setServer($server)->getStatus();
                    if ($status === 'offline') {
                        $isHibernating = true;
                    }
                } catch (Throwable $e) {
                    $isHibernating = true;
                }
            }
        }

        // Calculate continuous virtual uptime
        $createdSeconds = $server->created_at ? $server->created_at->diffInSeconds(now()) : 86400;

        return response()->json([
            'success' => true,
            'settings' => $settings,
            'is_proxy' => $isProxy,
            'is_hibernating' => $isHibernating,
            'virtual_uptime' => $createdSeconds,
            'server' => [
                'name' => $server->name,
                'memory_limit' => $server->memory,
                'cpu_limit' => $server->cpu,
                'smartsleep_enabled' => $defaultEnabled,
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
            'timeout' => 'required|integer|min:1|max:240',
            'custom_motd' => 'nullable|string|max:120',
            'bedrock_port' => 'nullable|integer|min:1|max:65535',
        ]);

        $enabled = (bool) $request->input('enabled', true);

        $settings = [
            'enabled' => $enabled,
            'timeout' => (int) $request->input('timeout', 20),
            'custom_motd' => (string) $request->input('custom_motd', ''),
            'bedrock_port' => $request->input('bedrock_port') ? (int) $request->input('bedrock_port') : null,
            'updated_at' => now()->toIso8601String(),
        ];

        // Sync with servers table column if it exists
        try {
            if (\Illuminate\Support\Facades\Schema::hasColumn('servers', 'smartsleep_enabled')) {
                $server->update(['smartsleep_enabled' => $enabled]);
            }
        } catch (Throwable $e) {}

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
            // Signal SmartSleep node daemon to unbind ports immediately
            $hosts = ['127.0.0.1'];
            if (!empty($server->node->fqdn) && !in_array($server->node->fqdn, ['localhost', '127.0.0.1'])) {
                $hosts[] = $server->node->fqdn;
            }
            foreach ($hosts as $h) {
                $ch = curl_init("http://{$h}:8995/wake?uuid=" . urlencode($server->uuid));
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 300);
                curl_setopt($ch, CURLOPT_TIMEOUT_MS, 600);
                curl_exec($ch);
                curl_close($ch);
            }

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
        $defaultEnabled = true;
        if (isset($server->smartsleep_enabled)) {
            $defaultEnabled = (bool) $server->smartsleep_enabled;
        }

        $defaults = [
            'enabled' => $defaultEnabled,
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
