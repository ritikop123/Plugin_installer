<?php

namespace Pterodactyl\Console\Commands;

use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\Server;
use Pterodactyl\Notifications\ServerSuspensionWarningNotification;
use Pterodactyl\Services\Servers\SuspensionService;

class AutoSuspendServersCommand extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'ptero:auto-suspend';

    /**
     * The console command description.
     */
    protected $description = 'Checks server expiration dates and suspends expired servers or sends 3-day warnings.';

    /**
     * Execute the console command.
     */
    public function handle(SuspensionService $suspensionService, \Pterodactyl\Repositories\Wings\DaemonPowerRepository $powerRepository): int
    {
        $now = Carbon::now();

        // 1. Process all servers that have reached their expiration date
        $expiredServers = Server::query()
            ->whereNotNull('expire_at')
            ->where('expire_at', '<=', $now)
            ->get();

        foreach ($expiredServers as $server) {
            $isAlreadySuspended = ($server->status === Server::STATUS_SUSPENDED);

            // A. If not marked suspended in panel, execute standard suspension service
            if (!$isAlreadySuspended) {
                try {
                    $this->info("Suspending expired server: [{$server->id}] {$server->name} (Expired at: {$server->expire_at})");
                    $suspensionService->toggle($server, SuspensionService::ACTION_SUSPEND);
                    Log::info("Auto-suspended expired server: [{$server->id}] {$server->name} (Expired at: {$server->expire_at})");
                } catch (\Throwable $e) {
                    $this->error("Failed to auto-suspend server [{$server->id}] {$server->name}: " . $e->getMessage());
                    Log::error("Failed to auto-suspend server [{$server->id}] {$server->name}: " . $e->getMessage());

                    // Fallback: force status in database
                    try {
                        $server->status = Server::STATUS_SUSPENDED;
                        $server->save();
                    } catch (\Throwable $ex) {}
                }
            }

            // B. Ensure Wings container is fully stopped/killed even if server was already marked suspended
            try {
                $status = $powerRepository->setServer($server)->getStatus();
                if ($status !== 'offline') {
                    $this->warn("Expired server [{$server->id}] {$server->name} container is currently '{$status}'. Forcing kill.");
                    $powerRepository->setServer($server)->send('kill');
                    Log::warning("Enforced stop/kill on expired server [{$server->id}] {$server->name} (was: {$status})");
                }
            } catch (\Throwable $e) {
                // If Wings is unreachable or already offline, ignore
            }
        }

        // 2. Process servers expiring within 3 days (72 hours) and notify owner once
        $threeDaysLater = $now->copy()->addDays(3);

        $expiringSoonServers = Server::query()
            ->whereNotNull('expire_at')
            ->where('expire_at', '>', $now)
            ->where('expire_at', '<=', $threeDaysLater)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', '!=', Server::STATUS_SUSPENDED);
            })
            ->with(['user'])
            ->get();

        foreach ($expiringSoonServers as $server) {
            // Check if warning was already sent for this current expiration cycle
            if (!is_null($server->expiration_warning_sent_at)) {
                continue;
            }

            if (!$server->user) {
                continue;
            }

            try {
                $daysLeft = max(1, (int) ceil($now->floatDiffInDays($server->expire_at)));
                $this->info("Sending {$daysLeft}-day suspension warning to [{$server->user->email}] for server [{$server->id}] {$server->name}");

                $server->user->notify(new ServerSuspensionWarningNotification($server, $daysLeft));

                $server->expiration_warning_sent_at = $now;
                $server->save();

                Log::info("Sent {$daysLeft}-day suspension warning to [{$server->user->email}] for server [{$server->id}] {$server->name}");
            } catch (\Throwable $e) {
                $this->warn("Could not send expiration warning email for server [{$server->id}]: " . $e->getMessage());
                Log::warning("Could not send expiration warning email for server [{$server->id}]: " . $e->getMessage());
            }
        }

        return 0;
    }
}
