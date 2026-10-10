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
            // A. Attempt to suspend via the standard SuspensionService (notifies Wings + sets DB)
            if ($server->status !== Server::STATUS_SUSPENDED) {
                try {
                    $this->info("Suspending expired server: [{$server->id}] {$server->name} (Expired at: {$server->expire_at})");
                    $suspensionService->toggle($server, SuspensionService::ACTION_SUSPEND);
                    Log::info("Auto-suspended expired server: [{$server->id}] {$server->name} (Expired at: {$server->expire_at})");
                } catch (\Throwable $e) {
                    $this->error("Failed to auto-suspend server [{$server->id}] {$server->name}: " . $e->getMessage());
                    Log::error("Failed to auto-suspend server [{$server->id}] {$server->name}: " . $e->getMessage());
                }
            }

            // B. Force-verify: refresh from DB and guarantee the suspended status is persisted.
            //    The toggle might have partially failed, a Wings callback might have cleared it,
            //    or a race condition with another process might have overwritten it.
            try {
                $server->refresh();
                if ($server->status !== Server::STATUS_SUSPENDED) {
                    $server->status = Server::STATUS_SUSPENDED;
                    $server->save();
                    $this->warn("Force-set suspension status in DB for expired server [{$server->id}] {$server->name}");
                    Log::warning("Force-set suspension status in DB for expired server [{$server->id}] {$server->name}");
                }
            } catch (\Throwable $e) {
                // Last-resort: try without refresh
                try {
                    $server->status = Server::STATUS_SUSPENDED;
                    $server->save();
                } catch (\Throwable $ex) {}
            }

            // C. Send kill signal to Wings unconditionally to stop the container.
            //    Don't gate behind getStatus() — if Wings can't report status, the kill would
            //    never fire, leaving the container running until someone opens the server page.
            try {
                $powerRepository->setServer($server)->send('kill');
                Log::info("Sent kill signal to expired server [{$server->id}] {$server->name}");
                $this->info("Sent kill signal to expired server [{$server->id}] {$server->name}");
            } catch (\Throwable $e) {
                // Wings unreachable or container already offline — nothing more we can do
                $this->warn("Could not send kill to expired server [{$server->id}] {$server->name}: " . $e->getMessage());
            }

            // D. Post-kill: re-verify suspension wasn't cleared by a Wings power-state callback
            //    or any other side-effect triggered during the kill request.
            try {
                $server->refresh();
                if ($server->status !== Server::STATUS_SUSPENDED) {
                    $server->status = Server::STATUS_SUSPENDED;
                    $server->save();
                    Log::warning("Re-enforced suspension status after kill for server [{$server->id}] {$server->name}");
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
