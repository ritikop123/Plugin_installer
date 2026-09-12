<?php

// patch-power-controller.php: Integrates SmartSleep daemon with Pterodactyl native power signals
// Wakes server immediately and releases port before Docker starts on 'start' or 'restart'
// Unbinds port and marks offline when 'stop' or 'kill' is clicked

$targetFile = "app/Http/Controllers/Api/Client/Servers/PowerController.php";

if (!file_exists($targetFile)) {
    echo "[!] File $targetFile not found. Skipping PowerController patch.\n";
    exit(0);
}

$content = file_get_contents($targetFile);

// Clean up any old hook
$content = preg_replace("/\/\*\s*>>>\s*SMARTSLEEP POWER HOOK START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*SMARTSLEEP POWER HOOK END\s*<<<\s*\*\/\s*/s", "", $content);

// If --revert is passed, write cleaned content and exit
if (isset($argv[1]) && $argv[1] === '--revert') {
    file_put_contents($targetFile, $content);
    echo "[✓] Reverted SmartSleep hook from PowerController.php\n";
    exit(0);
}

$hook = <<<'EOD'
        /* >>> SMARTSLEEP POWER HOOK START >>> */
        try {
            $source = $request->input('source');
            $signal = $request->input('signal');

            // If power action originates from SmartSleep daemon itself, allow standard stop
            if ($source !== 'smartsleep' && in_array($signal, ['start', 'restart', 'stop', 'kill'])) {
                $action = in_array($signal, ['start', 'restart']) ? 'wake' : 'unbind';

                // Fetch ports directly from database allocations
                $ports = [];
                if (!empty($server->id)) {
                    $ports = \Illuminate\Support\Facades\DB::table('allocations')
                        ->where('server_id', $server->id)
                        ->pluck('port')
                        ->toArray();
                }
                if (empty($ports) && !empty($server->allocation_id)) {
                    $p = \Illuminate\Support\Facades\DB::table('allocations')
                        ->where('id', $server->allocation_id)
                        ->value('port');
                    if ($p) $ports[] = $p;
                }
                $portParam = !empty($ports) ? '&port=' . implode(',', $ports) : '';

                // Try 127.0.0.1 first, fallback to node fqdn if remote
                $hosts = ['127.0.0.1'];
                if (!empty($server->node_id)) {
                    $fqdn = \Illuminate\Support\Facades\DB::table('nodes')->where('id', $server->node_id)->value('fqdn');
                    if (!empty($fqdn) && !in_array($fqdn, ['localhost', '127.0.0.1'])) {
                        $hosts[] = $fqdn;
                    }
                }

                $shortId = $server->identifier ?? substr($server->uuid, 0, 8);
                $queryStr = "uuid=" . urlencode($server->uuid) . "&id=" . urlencode($shortId) . $portParam;

                foreach ($hosts as $host) {
                    $ch = curl_init("http://{$host}:8995/{$action}?{$queryStr}");
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 300);
                    curl_setopt($ch, CURLOPT_TIMEOUT_MS, 500);
                    $res = curl_exec($ch);
                    curl_close($ch);
                    if ($res !== false) {
                        break;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Fail silently so standard Pterodactyl operations are never interrupted
        }
        /* <<< SMARTSLEEP POWER HOOK END <<< */

EOD;

if (strpos($content, '$this->repository->setServer($server)->send') !== false) {
    $content = str_replace(
        '$this->repository->setServer($server)->send',
        $hook . '        $this->repository->setServer($server)->send',
        $content
    );
    file_put_contents($targetFile, $content);
    echo "[✓] Successfully patched SmartSleep power hook into PowerController.php\n";
} else {
    echo "[!] Could not locate repository send call in PowerController.php\n";
}
