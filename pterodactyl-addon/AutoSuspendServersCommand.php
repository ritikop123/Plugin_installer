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

        // 1. Process all servers that have reached their expiration date and are not yet marked suspended
        $expiredServers = Server::query()
            ->whereNotNull('expire_at')
            ->where('expire_at', '<=', $now)
            ->where(function ($q) {
                $q->whereNull('status')
                  ->orWhere('status', '!=', Server::STATUS_SUSPENDED);
            })
            ->get();

        $count = $expiredServers->count();
        if ($count > 0) {
            $this->info("Found {$count} expired server(s) eligible for auto-suspension.");
        }

        foreach ($expiredServers as $server) {
            $this->info("Suspending expired server: [{$server->id}] {$server->name} (Expired at: {$server->expire_at})");

            // A. Attempt to suspend via the standard SuspensionService (notifies Wings + sets DB)
            try {
                $suspensionService->toggle($server, SuspensionService::ACTION_SUSPEND);
                $this->info("Auto-suspended server [{$server->id}] {$server->name} via SuspensionService.");
                Log::info("Auto-suspended expired server: [{$server->id}] {$server->name} (Expired at: {$server->expire_at})");
            } catch (\Throwable $e) {
                $this->warn("SuspensionService toggle note for server [{$server->id}] {$server->name}: " . $e->getMessage());
                Log::warning("SuspensionService toggle note for server [{$server->id}] {$server->name}: " . $e->getMessage());
            }

            // B. Force-verify: guarantee the suspended status is persisted in DB even if Wings sync threw an exception
            try {
                $server->refresh();
            } catch (\Throwable $e) {}

            if ($server->status !== Server::STATUS_SUSPENDED) {
                try {
                    $server->status = Server::STATUS_SUSPENDED;
                    $server->save();
                    $this->info("Force-marked suspension status in DB for expired server [{$server->id}] {$server->name}");
                    Log::info("Force-marked suspension status in DB for expired server [{$server->id}] {$server->name}");
                } catch (\Throwable $e) {
                    $this->error("Failed to force-save suspension status for server [{$server->id}]: " . $e->getMessage());
                    Log::error("Failed to force-save suspension status for server [{$server->id}]: " . $e->getMessage());
                }
            }

            // C. Send kill signal to Wings unconditionally to stop the container.
            try {
                $powerRepository->setServer($server)->send('kill');
                Log::info("Sent kill signal to expired server [{$server->id}] {$server->name}");
                $this->info("Sent kill signal to expired server [{$server->id}] {$server->name}");
            } catch (\Throwable $e) {
                // Wings unreachable or container already offline — nothing more we can do
            }

            // D. Post-kill: re-verify suspension status wasn't cleared by any side effect
            try {
                $server->refresh();
                if ($server->status !== Server::STATUS_SUSPENDED) {
                    $server->status = Server::STATUS_SUSPENDED;
                    $server->save();
                }
            } catch (\Throwable $e) {}
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
