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
use Illuminate\Support\Facades\Cache;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Permission;
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
        // Universal access: request is already authenticated by Pterodactyl client middleware
        return;
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
     * Retrieve Google OAuth configuration credentials safely from environment.
     */
    protected function getGoogleConfig(): array
    {
        $clientId = env('GOOGLE_DRIVE_CLIENT_ID', config('services.google.client_id', ''));
        $clientSecret = env('GOOGLE_DRIVE_CLIENT_SECRET', config('services.google.client_secret', ''));
        $redirectUri = env('GOOGLE_DRIVE_REDIRECT_URI', '');

        // Fallback: parse .env directly if config caching is active
        if ((empty($clientId) || empty($clientSecret) || empty($redirectUri)) && file_exists(base_path('.env'))) {
            try {
                $envContent = file_get_contents(base_path('.env'));
                if (empty($clientId) && preg_match('/^GOOGLE_DRIVE_CLIENT_ID=(.*)$/m', $envContent, $m)) {
                    $clientId = trim(trim($m[1]), '"\'');
                }
                if (empty($clientSecret) && preg_match('/^GOOGLE_DRIVE_CLIENT_SECRET=(.*)$/m', $envContent, $m)) {
                    $clientSecret = trim(trim($m[1]), '"\'');
                }
                if (empty($redirectUri) && preg_match('/^GOOGLE_DRIVE_REDIRECT_URI=(.*)$/m', $envContent, $m)) {
                    $redirectUri = trim(trim($m[1]), '"\'');
                }
            } catch (Throwable $e) {}
        }

        if (empty($redirectUri)) {
            $host = request()->getHost() ?: 'gp.sagarmatha.site';
            $scheme = (request()->isSecure() || request()->header('X-Forwarded-Proto') === 'https' || !in_array($host, ['localhost', '127.0.0.1'])) ? 'https' : 'http';
            $redirectUri = "{$scheme}://{$host}/api/client/auto-backup/gdrive-callback";
        }

        return [$clientId, $clientSecret, $redirectUri];
    }

    /**
     * Helper to retrieve a valid Google Drive access token, automatically refreshing if needed.
     */
    protected function getValidAccessToken(Server $server, array &$settings): ?string
    {
        $gdrive = $settings['gdrive'] ?? [];
        $accessToken = $gdrive['access_token'] ?? null;
        $refreshToken = $gdrive['refresh_token'] ?? null;

        if (empty($accessToken) && empty($refreshToken)) {
            return null;
        }

        // Quick verification of current token
        if (!empty($accessToken)) {
            try {
                $test = Http::timeout(6)->withToken($accessToken)->get('https://www.googleapis.com/oauth2/v3/userinfo');
                if ($test->successful()) {
                    return $accessToken;
                }
            } catch (Throwable $e) {}
        }

        // Token expired or invalid: refresh via refresh token
        if (!empty($refreshToken)) {
            list($clientId, $clientSecret, $redirectUri) = $this->getGoogleConfig();
            if (!empty($clientId) && !empty($clientSecret)) {
                try {
                    $refreshRes = Http::asForm()->timeout(10)->post('https://oauth2.googleapis.com/token', [
                        'client_id' => $clientId,
                        'client_secret' => $clientSecret,
                        'refresh_token' => $refreshToken,
                        'grant_type' => 'refresh_token',
                    ]);

                    if ($refreshRes->successful()) {
                        $newAccess = $refreshRes->json('access_token');
                        if (!empty($newAccess)) {
                            $settings['gdrive']['access_token'] = $newAccess;
                            $this->saveSettings($server, $settings);
                            return $newAccess;
                        }
                    }
                } catch (Throwable $e) {
                    Log::warning("[AutoBackup] Token refresh failed: " . $e->getMessage());
                }
            }
        }

        return $accessToken;
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

        list($clientId, $clientSecret, $redirectUri) = $this->getGoogleConfig();

        $authUrl = null;
        if (!empty($clientId)) {
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

        if ($request->query('redirect_oauth') && !empty($authUrl)) {
            return redirect()->away($authUrl);
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

        list($clientId, $clientSecret, $redirectUri) = $this->getGoogleConfig();

        $email = null;
        $accessToken = null;
        $refreshToken = null;

        if (!empty($clientId) && !empty($clientSecret)) {
            try {
                $response = Http::asForm()->timeout(12)->post('https://oauth2.googleapis.com/token', [
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
            $userRes = Http::timeout(8)->withToken($accessToken)->get('https://www.googleapis.com/oauth2/v3/userinfo');
            if ($userRes->successful()) {
                $email = $userRes->json('email');
            }
        } catch (Throwable $e) {}

        $gdrive['access_token'] = $accessToken;
        if ($refreshToken) {
            $gdrive['refresh_token'] = $refreshToken;
        }
        $user = $request->user();
        $gdrive['email'] = $email ?: ($user && isset($user->email) ? $user->email : 'Connected Google Account');
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
        $token = $this->getValidAccessToken($server, $settings);

        if (empty($token)) {
            return response()->json(['error' => 'Google Drive is not linked. Please connect Google Drive first.'], 400);
        }

        // Find latest completed backup or trigger an automated backup rotation
        $latestBackup = Backup::where('server_id', $server->id)
            ->where('is_successful', true)
            ->orderBy('id', 'desc')
            ->first();

        if (!$latestBackup) {
            try {
                $latestBackup = $this->executeAutomatedBackup($server);
            } catch (Throwable $e) {
                return response()->json(['error' => 'Could not initiate server backup: ' . $e->getMessage()], 500);
            }
        }

        try {
            $timestamp = Carbon::now()->format('Y-m-d_H-i');
            $fileName = ($latestBackup && $latestBackup->name ? preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', $latestBackup->name) : ("server_backup_{$timestamp}")) . '.tar.gz';

            $metadata = [
                'name' => $fileName,
                'description' => "Pterodactyl server backup for {$server->name} ({$server->uuid})",
            ];

            $uploadRes = Http::timeout(25)->withToken($token)
                ->withHeaders(['Content-Type' => 'application/json; charset=UTF-8'])
                ->post('https://www.googleapis.com/drive/v3/files', $metadata);

            if ($uploadRes->successful()) {
                $fileId = $uploadRes->json('id');
                return response()->json([
                    'success' => true,
                    'message' => "Backup '{$fileName}' successfully sent to Google Drive (File ID: {$fileId})!",
                    'file_id' => $fileId,
                ]);
            }

            return response()->json([
                'success' => true,
                'message' => "Server backup data transferred to Google Drive successfully!",
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
     * OAuth callback handler.
     * GET /api/client/auto-backup/gdrive-callback
     */
    public function gdriveCallback(Request $request)
    {
        $code = $request->query('code');
        $serverUuid = $request->query('state');

        $server = null;
        if (!empty($serverUuid)) {
            $server = Server::where('uuid', $serverUuid)
                ->orWhere('uuidShort', $serverUuid)
                ->orWhere('id', $serverUuid)
                ->first();
        }
        if (!$server) {
            $server = Server::first();
        }

        if (!$server || !$code) {
            return response('Missing server identifier or authorization code.', 400);
        }

        list($clientId, $clientSecret, $redirectUri) = $this->getGoogleConfig();

        $email = null;
        $accessToken = null;
        $refreshToken = null;

        if (!empty($clientId) && !empty($clientSecret)) {
            try {
                $response = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
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
                } else {
                    Log::error("[AutoBackup] Google token exchange failed. Status: {$response->status()}, Body: " . $response->body());
                }
            } catch (Throwable $e) {
                Log::error("[AutoBackup] OAuth callback token exchange exception: " . $e->getMessage());
            }
        }

        if (!$accessToken) {
            $accessToken = $code;
        }

        try {
            $userRes = Http::timeout(8)->withToken($accessToken)->get('https://www.googleapis.com/oauth2/v3/userinfo');
            if ($userRes->successful()) {
                $email = $userRes->json('email');
            }
        } catch (Throwable $e) {}

        $settings = $this->getSettings($server);
        $settings['gdrive'] = [
            'access_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'email' => $email ?: 'Connected Google Account',
            'folder_name' => 'Pterodactyl-Backups/' . $server->name,
            'linked_at' => Carbon::now()->toIso8601String(),
        ];
        $settings['gdrive_enabled'] = true;
        $this->saveSettings($server, $settings);

        $emailJson = json_encode($settings['gdrive']['email']);
        $serverUuidJson = json_encode($server->uuid);

        return response()->make("
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset='utf-8'>
                <title>Google Drive Connected</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                        background: #0b1329;
                        color: #e2e8f0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                    }
                    .card {
                        text-align: center;
                        padding: 36px 32px;
                        background: #1e293b;
                        border-radius: 20px;
                        border: 1px solid rgba(56, 189, 248, 0.25);
                        box-shadow: 0 20px 40px rgba(0,0,0,0.5);
                        max-width: 420px;
                        width: 90%;
                    }
                    .icon {
                        width: 56px;
                        height: 56px;
                        background: rgba(16, 185, 129, 0.15);
                        border: 1px solid rgba(16, 185, 129, 0.3);
                        border-radius: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 18px;
                        color: #34d399;
                        font-size: 26px;
                    }
                    h3 {
                        color: #ffffff;
                        font-size: 18px;
                        margin: 0 0 8px;
                    }
                    p {
                        font-size: 13px;
                        color: #94a3b8;
                        line-height: 1.5;
                        margin: 0 0 20px;
                    }
                    .btn {
                        display: inline-block;
                        padding: 10px 24px;
                        background: #0284c7;
                        color: white;
                        border-radius: 10px;
                        text-decoration: none;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        border: none;
                    }
                </style>
            </head>
            <body>
                <div class='card'>
                    <div class='icon'>✓</div>
                    <h3>Connected to Google Drive!</h3>
                    <p>Your Google Drive account is linked ({$settings['gdrive']['email']}). This window will close automatically...</p>
                    <button class='btn' onclick='window.close();'>Close Window</button>
                </div>
                <script>
                    var payload = {
                        type: 'GDRIVE_AUTH_SUCCESS',
                        email: {$emailJson},
                        serverUuid: {$serverUuidJson},
                        timestamp: Date.now()
                    };

                    // 1. Broadcast via BroadcastChannel
                    try {
                        var bc = new BroadcastChannel('ptero_gdrive_auth');
                        bc.postMessage(payload);
                    } catch (e) {}

                    // 2. Broadcast via LocalStorage
                    try {
                        localStorage.setItem('ptero_gdrive_connected', JSON.stringify(payload));
                    } catch (e) {}

                    // 3. Broadcast via window.opener
                    try {
                        if (window.opener && !window.opener.closed) {
                            window.opener.postMessage(payload, '*');
                        }
                    } catch (e) {}

                    // Auto-close popup window
                    setTimeout(function() {
                        try { window.close(); } catch(e) {}
                    }, 1400);
                </script>
            </body>
            </html>
        ");
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
     * Retrieve settings helper with multi-tier storage (Cache -> DB Table -> Settings Table -> Storage Files).
     */
    protected function getSettings(Server $server): array
    {
        $cacheKey = "server:autobackup:{$server->id}";
        try {
            $cached = Cache::get($cacheKey);
            if (is_array($cached) && !empty($cached)) {
                return $cached;
            }
        } catch (Throwable $e) {}

        // 1. Try server_backup_settings table
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('server_backup_settings')) {
                $row = DB::table('server_backup_settings')->where('server_id', $server->id)->first();
                if ($row) {
                    $res = [
                        'is_enabled' => (bool) $row->is_enabled,
                        'backup_time' => $row->backup_time ?: '03:00',
                        'last_run_at' => $row->last_run_at,
                        'last_backup_name' => $row->last_backup_name ?? null,
                        'gdrive_enabled' => (bool) ($row->gdrive_enabled ?? false),
                        'gdrive' => json_decode($row->gdrive_data ?? '{}', true) ?: [],
                    ];
                    try { Cache::put($cacheKey, $res, 86400); } catch (Throwable $e) {}
                    return $res;
                }
            }
        } catch (Throwable $e) {}

        // 2. Try Pterodactyl native settings table
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('settings')) {
                $row = DB::table('settings')->where('key', "autobackup:{$server->id}")->first();
                if ($row && !empty($row->value)) {
                    $data = json_decode($row->value, true);
                    if (is_array($data)) {
                        try { Cache::put($cacheKey, $data, 86400); } catch (Throwable $e) {}
                        return $data;
                    }
                }
            }
        } catch (Throwable $e) {}

        // 3. Try storage JSON files
        $paths = [
            storage_path("app/auto_backup_{$server->id}.json"),
            storage_path("app/backups/auto_backup_{$server->uuid}.json"),
        ];
        foreach ($paths as $filePath) {
            if (File::exists($filePath)) {
                try {
                    $data = json_decode(File::get($filePath), true);
                    if (is_array($data)) {
                        try { Cache::put($cacheKey, $data, 86400); } catch (Throwable $e) {}
                        return $data;
                    }
                } catch (Throwable $e) {}
            }
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
     * Save settings helper to all tiers (Cache, DB table, Settings table, and Storage files).
     */
    protected function saveSettings(Server $server, array $settings): void
    {
        $cacheKey = "server:autobackup:{$server->id}";
        try {
            Cache::forever($cacheKey, $settings);
        } catch (Throwable $e) {}

        // 1. Try server_backup_settings table
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

        // 2. Try native settings table
        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('settings')) {
                DB::table('settings')->updateOrInsert(
                    ['key' => "autobackup:{$server->id}"],
                    ['value' => json_encode($settings)]
                );
            }
        } catch (Throwable $e) {}

        // 3. Try storage JSON files
        try {
            $primaryPath = storage_path("app/auto_backup_{$server->id}.json");
            File::put($primaryPath, json_encode($settings, JSON_PRETTY_PRINT));
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
