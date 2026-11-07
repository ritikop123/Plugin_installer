<?php

namespace Pterodactyl\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Models\Server;
use Pterodactyl\Repositories\Wings\DaemonServerRepository;

class CpuBurstGovernorCommand extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'ptero:cpu-burst {--once : Run a single evaluation cycle and exit}';

    /**
     * The console command description.
     */
    protected $description = 'Dynamic Real CPU + Burst CPU Governor for Pterodactyl servers (prevents node lag while allowing spike & startup bursting).';

    /**
     * Maximum burst credits in seconds (60 seconds of continuous max burst).
     */
    private const MAX_BURST_CREDITS = 60.0;

    /**
     * Minimum credits required to initiate a new burst (prevents rapid flapping when depleted).
     */
    private const MIN_CREDITS_TO_START_BURST = 12.0;

    /**
     * Tick interval in seconds.
     */
    private const TICK_SECONDS = 3;

    /**
     * Execute the console command.
     */
    public function handle(DaemonServerRepository $daemonRepository): int
    {
        $runOnce = (bool) $this->option('once');

        if ($runOnce) {
            $this->evaluateServers($daemonRepository);
            return 0;
        }

        // Prevent multiple overlapping loops within the same minute
        $lockKey = 'ptero_cpu_burst_governor_running';
        if (!Cache::add($lockKey, true, 58)) {
            return 0;
        }

        try {
            $startTime = time();
            // Run for ~56 seconds (18 ticks at 3s intervals) per minute cron invocation
            while ((time() - $startTime) < 55) {
                $loopStart = microtime(true);

                try {
                    $this->evaluateServers($daemonRepository);
                } catch (\Throwable $e) {
                    Log::warning('[CpuBurstGovernor] Cycle error: ' . $e->getMessage());
                }

                $elapsed = microtime(true) - $loopStart;
                $sleepSec = max(1, (int) round(self::TICK_SECONDS - $elapsed));
                if ((time() - $startTime + $sleepSec) >= 57) {
                    break;
                }
                sleep($sleepSec);
            }
        } finally {
            Cache::forget($lockKey);
        }

        return 0;
    }

    /**
     * Evaluate all servers configured with Real CPU + Burst CPU.
     */
    private function evaluateServers(DaemonServerRepository $daemonRepository): void
    {
        $servers = Server::query()
            ->with('node')
            ->where('cpu', '>', 0)
            ->where('burst_cpu', '>', 0)
            ->whereColumn('burst_cpu', '>', 'cpu')
            ->get();

        if ($servers->isEmpty()) {
            return;
        }

        // Group servers by node_id so we can enforce per-node anti-lag protection
        $byNode = $servers->groupBy('node_id');

        foreach ($byNode as $nodeId => $nodeServers) {
            $this->evaluateNodeServers($nodeServers, $daemonRepository);
        }
    }

    /**
     * Evaluate servers on a single Wings node with node-wide spike & boot-storm protection.
     */
    private function evaluateNodeServers($nodeServers, DaemonServerRepository $daemonRepository): void
    {
        $metrics = [];
        $startingCount = 0;
        $totalRealCpuAllocated = 0;
        $totalCurrentCpuUsed = 0.0;

        foreach ($nodeServers as $server) {
            if ($server->isSuspended()) {
                if ($server->is_bursting) {
                    $this->setBurstMode($server, false, $daemonRepository, 'Server suspended');
                }
                continue;
            }

            try {
                $details = $daemonRepository->setServer($server)->getDetails();
            } catch (\Throwable $e) {
                // Node unreachable or container not created yet
                continue;
            }

            $state = strtolower((string) ($details['state'] ?? 'offline'));
            $cpuUsage = (float) ($details['utilization']['cpu_absolute'] ?? 0.0);

            $metrics[$server->id] = [
                'server' => $server,
                'state' => $state,
                'cpu' => $cpuUsage,
            ];

            if ($state !== 'offline') {
                $totalRealCpuAllocated += (int) $server->cpu;
                $totalCurrentCpuUsed += $cpuUsage;
            }
            if ($state === 'starting') {
                $startingCount++;
            }
        }

        if (empty($metrics)) {
            return;
        }

        // Node Congestion Check:
        // If total live CPU across monitored servers exceeds 150% of their combined Real CPU baseline
        // (and is at least > 250% absolute), the node is experiencing heavy multi-server contention.
        $nodeCongested = ($totalRealCpuAllocated > 0)
            && ($totalCurrentCpuUsed > max(250.0, $totalRealCpuAllocated * 1.5));

        foreach ($metrics as $serverId => $data) {
            /** @var Server $server */
            $server = $data['server'];
            $state = $data['state'];
            $cpuUsage = $data['cpu'];
            $realCpu = (float) $server->cpu;
            $burstCpu = (float) $server->burst_cpu;

            $creditKey = "ptero_cpu_burst_credits_{$server->id}";
            $spikeCountKey = "ptero_cpu_spike_ticks_{$server->id}";

            $credits = (float) Cache::get($creditKey, self::MAX_BURST_CREDITS);
            $spikeTicks = (int) Cache::get($spikeCountKey, 0);

            // 1. Offline / Stopping: Reset to Real CPU & full credits
            if ($state === 'offline' || $state === 'stopping') {
                Cache::put($creditKey, self::MAX_BURST_CREDITS, 3600);
                Cache::put($spikeCountKey, 0, 3600);
                if ($server->is_bursting) {
                    $this->setBurstMode($server, false, $daemonRepository, 'Server offline/stopping');
                }
                continue;
            }

            // 2. Credit Bucket Math (AWS T3 / Sparked Host Token Bucket)
            if ($cpuUsage > $realCpu) {
                // Draining credits proportional to how hard it's bursting above Real CPU
                $extraRange = max(1.0, $burstCpu - $realCpu);
                $burstIntensity = min(1.5, ($cpuUsage - $realCpu) / $extraRange);
                // Minimum 0.5x drain whenever above Real CPU so infinite loops at 120% still drain
                $drainRate = max(0.5, $burstIntensity);
                $credits = max(0.0, $credits - (self::TICK_SECONDS * $drainRate));
            } elseif ($cpuUsage < ($realCpu * 0.75)) {
                // Recharging credits when running cleanly below 75% of Real CPU
                $credits = min(self::MAX_BURST_CREDITS, $credits + (self::TICK_SECONDS * 0.6));
            }

            // Track consecutive high-load ticks (>= 82% of Real CPU)
            if ($cpuUsage >= ($realCpu * 0.82)) {
                $spikeTicks++;
            } else {
                $spikeTicks = 0;
            }

            Cache::put($creditKey, $credits, 3600);
            Cache::put($spikeCountKey, $spikeTicks, 3600);

            // 3. Determine if Server Should Burst
            $wantBurst = false;
            $reason = '';

            // Anti-Boot-Storm: Allow startup burst only if <= 2 servers are booting simultaneously on this node
            if ($state === 'starting' && $startingCount <= 2 && !$nodeCongested && $credits > 5.0) {
                $wantBurst = true;
                $reason = "Fast Startup Burst ({$realCpu}% -> {$burstCpu}%)";
            } elseif ($server->is_bursting) {
                // Currently bursting: stay in burst until spike drops below 70% of Real CPU, OR credits hit 0, OR node is congested
                if ($credits <= 0.0) {
                    $wantBurst = false;
                    $reason = "Burst credits depleted (60s limit reached); stepping down to Real CPU ({$realCpu}%)";
                } elseif ($nodeCongested) {
                    $wantBurst = false;
                    $reason = "Node safety guard triggered; stepping down to Real CPU ({$realCpu}%)";
                } elseif ($state !== 'starting' && $cpuUsage < ($realCpu * 0.70)) {
                    $wantBurst = false;
                    $reason = "Performance spike finished (CPU {$cpuUsage}%); returning to Real CPU ({$realCpu}%)";
                } else {
                    $wantBurst = true;
                }
            } else {
                // Currently in Normal Mode (Real CPU): trigger burst if CPU >= 82% of Real CPU and credits >= 12s
                if (!$nodeCongested && $spikeTicks >= 1 && $credits >= self::MIN_CREDITS_TO_START_BURST) {
                    $wantBurst = true;
                    $reason = "Performance spike detected (CPU {$cpuUsage}% / {$realCpu}%); activating Burst CPU ({$burstCpu}%)";
                }
            }

            // 4. Apply Transition if Changed
            if ($wantBurst !== (bool) $server->is_bursting) {
                $this->setBurstMode($server, $wantBurst, $daemonRepository, $reason);
            }
        }
    }

    /**
     * Toggle burst state on the Server model and live-sync container quota with Wings.
     */
    private function setBurstMode(
        Server $server,
        bool $bursting,
        DaemonServerRepository $daemonRepository,
        string $reason
    ): void {
        try {
            $server->is_bursting = $bursting;
            $server->saveQuietly();

            // Live-sync with Wings so Docker updates container CPU quota & IO weight in-place without restarting!
            $daemonRepository->setServer($server)->sync();

            $modeLabel = $bursting ? "BURST ({$server->burst_cpu}%)" : "REAL ({$server->cpu}%)";
            $this->info("[Server #{$server->id} {$server->name}] Switched to {$modeLabel} — {$reason}");
        } catch (\Throwable $e) {
            Log::warning("[CpuBurstGovernor] Failed to sync burst state for server {$server->id}: " . $e->getMessage());
        }
    }
}
