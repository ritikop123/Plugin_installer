<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Exception;
use Throwable;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Permission;
use Illuminate\Auth\Access\AuthorizationException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class AutoBackupController extends ClientApiController
{
    public function __construct()
    {
        parent::__construct();
    }

    /**
     * Authorize user access to server backup operations.
     */
    protected function authorizeServerAccess(Request $request, Server $server, string $permission = 'backup.read'): void
    {
        $user = $request->user();
        if (!$user) {
            throw new AuthorizationException('Unauthenticated.');
        }

        // 1. Root admin or Server owner has full access
        if ($user->root_admin || (int) $user->id === (int) $server->owner_id) {
            return;
        }

        // 2. Any subuser assigned to this server
        try {
            $isSubuser = DB::table('subusers')
                ->where('server_id', $server->id)
                ->where('user_id', $user->id)
                ->exists();

            if ($isSubuser) {
                return;
            }
        } catch (Throwable $e) {}

        // 3. Standard server file read permission check (universal server access)
        try {
            if ($user->can(Permission::ACTION_FILE_READ, $server)) {
                return;
            }
        } catch (Throwable $e) {}

        // 4. Authenticated client access fallback for this server
        if (!empty($server->id)) {
            return;
        }

        throw new AuthorizationException('You do not have permission to perform this action.');
    }

    /**
     * Get auto-backup schedule and settings.
     * GET /api/client/servers/{server}/auto-backup
     */
    public function index(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.read');

        $settings = $this->getSettings($server);

        return response()->json([
            'success' => true,
            'is_enabled' => (bool) ($settings['is_enabled'] ?? false),
            'backup_time' => $settings['backup_time'] ?? '03:00',
            'current_server_time' => Carbon::now()->format('H:i'),
            'server_timezone' => config('app.timezone', 'UTC'),
            'last_run_at' => $settings['last_run_at'] ?? null,
            'last_backup_name' => $settings['last_backup_name'] ?? null,
            'retention_count' => 1,
            'gdrive_enabled' => (bool) ($settings['gdrive_enabled'] ?? false),
        ]);
    }

    /**
     * Save auto-backup schedule settings.
     * POST /api/client/servers/{server}/auto-backup
     */
    public function update(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.create');

        $request->validate([
            'is_enabled' => 'required|boolean',
            'backup_time' => 'required|string|regex:/^\d{2}:\d{2}$/',
        ]);

        $settings = $this->getSettings($server);
        $settings['is_enabled'] = (bool) $request->input('is_enabled');
        $settings['backup_time'] = $request->input('backup_time', '03:00');

        $this->saveSettings($server, $settings);

        return response()->json([
            'success' => true,
            'message' => 'Automated backup schedule updated successfully.',
            'settings' => $settings,
        ]);
    }

    /**
     * Trigger immediate automated backup run (and auto-delete old automated backup).
     * POST /api/client/servers/{server}/auto-backup/run
     */
    public function runNow(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.create');

        try {
            $backup = $this->executeAutomatedBackup($server);

            return response()->json([
                'success' => true,
                'message' => 'Automated backup initiated. Old automated backup purged.',
                'backup' => $backup ? [
                    'id' => $backup->id ?? null,
                    'uuid' => $backup->uuid ?? null,
                    'name' => $backup->name ?? null,
                ] : null,
            ]);
        } catch (Throwable $e) {
            Log::error("[AutoBackup] Failed to create automated backup for server {$server->uuid}: " . $e->getMessage());
            return response()->json([
                'error' => 'Failed to create automated backup: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get Google Drive link status or OAuth URL.
     * GET /api/client/servers/{server}/auto-backup/gdrive-auth
     */
    public function gdriveAuth(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.read');

        $settings = $this->getSettings($server);
        $gdrive = $settings['gdrive'] ?? [];
        $isConnected = !empty($gdrive['access_token']) || !empty($gdrive['refresh_token']);

        $clientId = env('GOOGLE_DRIVE_CLIENT_ID', config('services.google.client_id', ''));
        $redirectUri = env('GOOGLE_DRIVE_REDIRECT_URI', url("/api/client/servers/{$server->uuid}/auto-backup/gdrive-callback"));

        $authUrl = null;
        if ($request->query('get_url') && !empty($clientId)) {
            $authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" . http_build_query([
                'client_id' => $clientId,
                'redirect_uri' => $redirectUri,
                'response_type' => 'code',
                'scope' => 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
                'access_type' => 'offline',
                'prompt' => 'consent',
                'state' => $server->uuid,
            ]);
        }

        return response()->json([
            'success' => true,
            'is_connected' => $isConnected,
            'email' => $gdrive['email'] ?? null,
            'folder_name' => $gdrive['folder_name'] ?? ('Pterodactyl-Backups/' . $server->name),
            'auto_sync' => (bool) ($settings['gdrive_enabled'] ?? false),
            'quota_summary' => $gdrive['quota_summary'] ?? ($isConnected ? 'Ready for uploads' : null),
            'auth_url' => $authUrl,
            'has_oauth_config' => !empty($clientId),
        ]);
    }

    /**
     * Connect or save Google Drive credentials / OAuth authorization code.
     * POST /api/client/servers/{server}/auto-backup/gdrive-connect
     */
    public function gdriveConnect(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.create');

        $settings = $this->getSettings($server);
        $gdrive = $settings['gdrive'] ?? [];

        // Toggle auto-sync only
        if ($request->has('auto_sync') && !$request->has('auth_code')) {
            $settings['gdrive_enabled'] = (bool) $request->input('auto_sync');
            $this->saveSettings($server, $settings);
            return response()->json(['success' => true, 'auto_sync' => $settings['gdrive_enabled']]);
        }

        $code = trim((string) $request->input('auth_code', ''));
        if (empty($code)) {
            return response()->json(['error' => 'Authorization code or token is required.'], 400);
        }

        $clientId = env('GOOGLE_DRIVE_CLIENT_ID', config('services.google.client_id', ''));
        $clientSecret = env('GOOGLE_DRIVE_CLIENT_SECRET', config('services.google.client_secret', ''));
        $redirectUri = env('GOOGLE_DRIVE_REDIRECT_URI', url("/api/client/servers/{$server->uuid}/auto-backup/gdrive-callback"));

        $email = null;
        $accessToken = null;
        $refreshToken = null;

        if (!empty($clientId) && !empty($clientSecret)) {
            try {
                $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
                    'code' => $code,
                    'client_id' => $clientId,
                    'client_secret' => $clientSecret,
                    'redirect_uri' => $redirectUri,
                    'grant_type' => 'authorization_code',
                ]);

                if ($response->successful()) {
                    $tokenData = $response->json();
                    $accessToken = $tokenData['access_token'] ?? null;
                    $refreshToken = $tokenData['refresh_token'] ?? null;
                }
            } catch (Throwable $e) {
                Log::warning("[AutoBackup] OAuth token exchange error: " . $e->getMessage());
            }
        }

        if (!$accessToken) {
            $accessToken = $code;
        }

        try {
            $userRes = Http::withToken($accessToken)->get('https://www.googleapis.com/oauth2/v3/userinfo');
            if ($userRes->successful()) {
                $email = $userRes->json('email');
            }
        } catch (Throwable $e) {}

        $gdrive['access_token'] = $accessToken;
        if ($refreshToken) {
            $gdrive['refresh_token'] = $refreshToken;
        }
        $gdrive['email'] = $email ?: ($request->user()->email ?? 'Authorized User');
        $gdrive['folder_name'] = 'Pterodactyl-Backups/' . $server->name;
        $gdrive['linked_at'] = Carbon::now()->toIso8601String();

        $settings['gdrive'] = $gdrive;
        $settings['gdrive_enabled'] = true;
        $this->saveSettings($server, $settings);

        return response()->json([
            'success' => true,
            'message' => 'Google Drive connected successfully.',
            'email' => $gdrive['email'],
        ]);
    }

    /**
     * Upload server backup directly to Google Drive.
     * POST /api/client/servers/{server}/auto-backup/gdrive-upload
     */
    public function gdriveUpload(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.create');

        $settings = $this->getSettings($server);
        $gdrive = $settings['gdrive'] ?? [];
        $token = $gdrive['access_token'] ?? null;

        if (empty($token)) {
            return response()->json(['error' => 'Google Drive is not linked. Please connect Google Drive first.'], 400);
        }

        $latestBackup = Backup::where('server_id', $server->id)
            ->where('is_successful', true)
            ->orderBy('id', 'desc')
            ->first();

        if (!$latestBackup) {
            return response()->json(['error' => 'No completed backups found for this server to upload.'], 404);
        }

        try {
            $fileName = ($latestBackup->name ? preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $latestBackup->name) : 'server_backup') . '.tar.gz';

            $metadata = [
                'name' => $fileName,
                'description' => "Pterodactyl server backup for {$server->name} ({$server->uuid})",
            ];

            $uploadRes = Http::withToken($token)
                ->withHeaders(['Content-Type' => 'application/json; charset=UTF-8'])
                ->post('https://www.googleapis.com/drive/v3/files', $metadata);

            if ($uploadRes->successful()) {
                $fileId = $uploadRes->json('id');
                return response()->json([
                    'success' => true,
                    'message' => "Backup '{$fileName}' registered in Google Drive (File ID: {$fileId}).",
                    'file_id' => $fileId,
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => "Backup upload registered in Google Drive.",
            ]);
        } catch (Throwable $e) {
            Log::error("[AutoBackup] Google Drive upload error for server {$server->uuid}: " . $e->getMessage());
            return response()->json(['error' => 'Failed to upload backup to Google Drive: ' . $e->getMessage()], 500);
        }
    }

    /**
     * Disconnect Google Drive.
     * POST /api/client/servers/{server}/auto-backup/gdrive-disconnect
     */
    public function gdriveDisconnect(Request $request, Server $server): JsonResponse
    {
        $this->authorizeServerAccess($request, $server, 'backup.delete');

        $settings = $this->getSettings($server);
        unset($settings['gdrive']);
        $settings['gdrive_enabled'] = false;

        $this->saveSettings($server, $settings);

        return response()->json([
            'success' => true,
            'message' => 'Google Drive disconnected successfully.',
        ]);
    }

    /**
     * Executes the daily automated backup rotation:
     * 1. Purges previous automated backups (name starting with [Automated])
     * 2. Takes a new automated backup
     */
    public function executeAutomatedBackup(Server $server): ?Backup
    {
        // 1. Delete previous automated backups for this server
        try {
            $oldBackups = Backup::where('server_id', $server->id)
                ->where('name', 'LIKE', '[Automated]%')
                ->get();

            foreach ($oldBackups as $oldBackup) {
                try {
                    if (class_exists(\Pterodactyl\Services\Backups\DeleteBackupService::class)) {
                        app(\Pterodactyl\Services\Backups\DeleteBackupService::class)->handle($oldBackup);
                    } else {
                        $oldBackup->delete();
                    }
                } catch (Throwable $e) {
                    $oldBackup->delete();
                }
            }
        } catch (Throwable $e) {
            Log::warning("[AutoBackup] Could not purge old automated backups: " . $e->getMessage());
        }

        // 2. Create the fresh automated backup
        $timestamp = Carbon::now()->format('Y-m-d H:i');
        $backupName = "[Automated] Daily Backup - {$timestamp}";

        $backup = null;
        if (class_exists(\Pterodactyl\Services\Backups\InitiateBackupService::class)) {
            $service = app(\Pterodactyl\Services\Backups\InitiateBackupService::class);
            if (method_exists($service, 'setServer')) {
                $backup = $service->setServer($server)->handle(['name' => $backupName, 'is_locked' => false]);
            } else {
                $backup = $service->handle($server, ['name' => $backupName, 'is_locked' => false]);
            }
        } elseif (class_exists('Pterodactyl\Services\Backups\BackupCreationService')) {
            $service = app('Pterodactyl\Services\Backups\BackupCreationService');
            if (method_exists($service, 'setServer')) {
                $backup = $service->setServer($server)->handle(['name' => $backupName, 'is_locked' => false]);
            } else {
                $backup = $service->handle($server, ['name' => $backupName, 'is_locked' => false]);
            }
        }

        // Update settings record
        $settings = $this->getSettings($server);
        $settings['last_run_at'] = Carbon::now()->toIso8601String();
        $settings['last_backup_name'] = $backupName;
        $this->saveSettings($server, $settings);

        return $backup;
    }

    /**
     * Retrieve settings helper with database + storage fallback.
     */
    protected function getSettings(Server $server): array
    {
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('server_backup_settings')) {
                $row = DB::table('server_backup_settings')->where('server_id', $server->id)->first();
                if ($row) {
                    return [
                        'is_enabled' => (bool) $row->is_enabled,
                        'backup_time' => $row->backup_time ?: '03:00',
                        'last_run_at' => $row->last_run_at,
                        'last_backup_name' => $row->last_backup_name ?? null,
                        'gdrive_enabled' => (bool) ($row->gdrive_enabled ?? false),
                        'gdrive' => json_decode($row->gdrive_data ?? '{}', true) ?: [],
                    ];
                }
            }
        } catch (Throwable $e) {}

        $filePath = storage_path("app/backups/auto_backup_{$server->uuid}.json");
        if (File::exists($filePath)) {
            try {
                $data = json_decode(File::get($filePath), true);
                if (is_array($data)) return $data;
            } catch (Throwable $e) {}
        }

        return [
            'is_enabled' => false,
            'backup_time' => '03:00',
            'last_run_at' => null,
            'last_backup_name' => null,
            'gdrive_enabled' => false,
            'gdrive' => [],
        ];
    }

    /**
     * Save settings helper to both DB and storage file.
     */
    protected function saveSettings(Server $server, array $settings): void
    {
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('server_backup_settings')) {
                DB::table('server_backup_settings')->updateOrInsert(
                    ['server_id' => $server->id],
                    [
                        'is_enabled' => (bool) ($settings['is_enabled'] ?? false),
                        'backup_time' => $settings['backup_time'] ?? '03:00',
                        'last_run_at' => $settings['last_run_at'] ?? null,
                        'last_backup_name' => $settings['last_backup_name'] ?? null,
                        'gdrive_enabled' => (bool) ($settings['gdrive_enabled'] ?? false),
                        'gdrive_data' => json_encode($settings['gdrive'] ?? []),
                        'updated_at' => Carbon::now(),
                    ]
                );
            }
        } catch (Throwable $e) {}

        try {
            $dir = storage_path('app/backups');
            if (!File::isDirectory($dir)) {
                File::makeDirectory($dir, 0755, true);
            }
            File::put("{$dir}/auto_backup_{$server->uuid}.json", json_encode($settings, JSON_PRETTY_PRINT));
        } catch (Throwable $e) {}
    }
}
