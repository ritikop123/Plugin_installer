<?php

// =========================================================================
//  Arix Theme Demo Account & Dummy Server Preview Unpatcher
// =========================================================================

echo "[*] Removing Demo Preview Mode patches...\n";

$phpFiles = [
    'app/Http/Kernel.php',
    'app/Models/User.php',
    'app/Models/Server.php',
    'app/Transformers/Api/Client/AccountTransformer.php',
    'app/Transformers/Api/Client/ServerTransformer.php',
];

foreach ($phpFiles as $file) {
    if (!file_exists($file)) continue;
    $c = file_get_contents($file);
    $orig = $c;
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);
    if ($c !== $orig) {
        file_put_contents($file, $c);
        echo "[✓] Cleaned demo mode patches from {$file}\n";
    }
}

$tsTargets = [
    'resources/scripts/api/server/getServer.ts',
    'resources/scripts/api/getServers.ts',
    'resources/scripts/plugins/Websocket.ts',
    'resources/scripts/components/App.tsx',
];

foreach ($tsTargets as $file) {
    if (!file_exists($file)) continue;
    $c = file_get_contents($file);
    $orig = $c;
    $c = preg_replace('/\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/[\s\S]*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\/\r?\n?/s', '', $c);
    $c = preg_replace('/\r?\n?[ \t]*\{\/\*\s*>>>\s*ARIX DEMO MODE START[\s\S]*?ARIX DEMO MODE END\s*<<<\s*\*\/\}/s', '', $c);
    $c = preg_replace('/import\s+DemoBanner\s+from\s+[^;]+;\s*/s', '', $c);
    $c = preg_replace('/<DemoBanner\s*\/>\s*/s', '', $c);
    if ($c !== $orig) {
        file_put_contents($file, $c);
        echo "[✓] Cleaned demo mode patches from {$file}\n";
    }
}

$compDir = 'resources/scripts/components';
if (is_dir($compDir)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($compDir));
    foreach ($it as $file) {
        if (!$file->isFile() || !preg_match('/\.(tsx|ts)$/', $file->getFilename())) continue;
        $fp = $file->getPathname();
        if (strpos($fp, 'DemoBanner.tsx') !== false) continue;

        $c = file_get_contents($fp);
        $orig = $c;
        $c = preg_replace('/\r?\n?[ \t]*\{?\/\*\s*>>>\s*ARIX DEMO MODE START[\s\S]*?ARIX DEMO MODE END\s*<<<\s*\*\/\}?/s', '', $c);
        $c = str_replace('isDemoServer || ', '', $c);

        if ($c !== $orig) {
            file_put_contents($fp, $c);
            echo "[✓] Cleaned demo mode patches from {$fp}\n";
        }
    }
}

echo "[✓] Demo Preview Mode unpatched cleanly.\n";
