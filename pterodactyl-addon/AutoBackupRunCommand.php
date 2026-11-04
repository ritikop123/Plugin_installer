<?php

namespace Pterodactyl\Console\Commands;

use Throwable;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\File;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Backup;

class AutoBackupRunCommand extends Command
{
    protected $signature = 'ptero:auto-backup {--force : Force execute backup regardless of scheduled time}';
    protected $description = 'Execute scheduled automated backups for servers and purge old automated snapshots';

    public function __construct()
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $now = Carbon::now();
        $currentTime = $now->format('H:i');
        $force = (bool) $this->option('force');

        $this->info("[AutoBackup] Checking daily automated backup schedules at {$currentTime} {$now->timezoneName}...");

        // Query active servers
        $servers = Server::query()->where('installed', 1)->where('suspended', 0)->get();

        $processedCount = 0;

        foreach ($servers as $server) {
            $settings = $this->getServerSettings($server);

            if (!$settings['is_enabled'] && !$force) {
                continue;
            }

            $scheduledTime = $settings['backup_time'] ?? '03:00';

            // Check if current minute matches scheduled time
            $isTimeMatch = ($currentTime === $scheduledTime);

            // Check if already executed in the last 20 hours to prevent duplicate runs
            $lastRun = !empty($settings['last_run_at']) ? Carbon::parse($settings['last_run_at']) : null;
            $recentlyRan = $lastRun && $lastRun->diffInHours($now) < 20;

            if (($isTimeMatch && !$recentlyRan) || $force) {
                $this->info("[*] Running daily automated backup for server #{$server->id} ({$server->name})...");

                try {
                    // 1. Purge old automated backups for this server
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
                            $this->line("    [✓] Purged old automated backup: {$oldBackup->name}");
                        } catch (Throwable $e) {
                            $oldBackup->delete();
                        }
                    }

                    // 2. Create the new automated daily backup
                    $timestamp = $now->format('Y-m-d H:i');
                    $backupName = "[Automated] Daily Backup - {$timestamp}";

                    $backupCreated = false;

                    // Try InitiateBackupService (standard in Pterodactyl 1.x)
                    if (class_exists(\Pterodactyl\Services\Backups\InitiateBackupService::class)) {
                        $service = app(\Pterodactyl\Services\Backups\InitiateBackupService::class);
                        if (method_exists($service, 'setServer')) {
                            $service->setServer($server)->handle(['name' => $backupName, 'is_locked' => false]);
                        } else {
                            $service->handle($server, ['name' => $backupName, 'is_locked' => false]);
                        }
                        $backupCreated = true;
                    } elseif (class_exists('Pterodactyl\Services\Backups\BackupCreationService')) {
                        $service = app('Pterodactyl\Services\Backups\BackupCreationService');
                        if (method_exists($service, 'setServer')) {
                            $service->setServer($server)->handle(['name' => $backupName, 'is_locked' => false]);
                        } else {
                            $service->handle($server, ['name' => $backupName, 'is_locked' => false]);
                        }
                        $backupCreated = true;
                    }

                    if ($backupCreated) {
                        $this->info("    [✓] Fresh automated backup created: {$backupName}");
                    }

                    // 3. Update last run timestamp
                    $settings['last_run_at'] = $now->toIso8601String();
                    $settings['last_backup_name'] = $backupName;
                    $this->saveServerSettings($server, $settings);

                    $processedCount++;
                } catch (Throwable $e) {
                    $this->error("    [✗] Error during automated backup for server #{$server->id}: " . $e->getMessage());
                    Log::error("[AutoBackupCommand] Server {$server->id} error: " . $e->getMessage());
                }
            }
        }

        $this->info("[AutoBackup] Run completed. Total automated backups triggered: {$processedCount}.");
        return 0;
    }

    protected function getServerSettings(Server $server): array
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
        ];
    }

    protected function saveServerSettings(Server $server, array $settings): void
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
