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
            $signal = $request->input('signal');
            if (in_array($signal, ['start', 'restart'])) {
                $hosts = ['127.0.0.1'];
                if (!empty($server->node->fqdn) && !in_array($server->node->fqdn, ['localhost', '127.0.0.1'])) {
                    $hosts[] = $server->node->fqdn;
                }
                $portParam = '';
                if (!empty($server->allocation) && !empty($server->allocation->port)) {
                    $portParam = '&port=' . (int) $server->allocation->port;
                }
                foreach ($hosts as $host) {
                    $ch = curl_init("http://{$host}:8995/wake?uuid=" . urlencode($server->uuid) . $portParam);
                    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT_MS, 300);
                    curl_setopt($ch, CURLOPT_TIMEOUT_MS, 600);
                    curl_exec($ch);
                    curl_close($ch);
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
