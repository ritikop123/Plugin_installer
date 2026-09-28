<?php

// Revert Part 1: ServerExpiryCard in server console
$baseDir = "resources/scripts/components/server";
if (is_dir($baseDir)) {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($baseDir));
    foreach ($files as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $path = $file->getPathname();
            $c = file_get_contents($path);
            if (strpos($c, "ARIX DASHBOARD CARD") !== false || strpos($c, "ServerExpiryCard") !== false) {
                $c = preg_replace("/\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/[\s\S]*?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\s*/s", "", $c);
                $c = preg_replace("/\{?\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\}?\s*/s", "", $c);
                file_put_contents($path, $c);
                echo "[✓] Reverted dashboard card patch in $path\n";
            }
        }
    }
}

// Revert Part 2: ServerExpiryBadge in dashboard/arix cards
$scanDirs = [
    "resources/scripts/components/dashboard",
    "resources/scripts/components/arix",
];

foreach ($scanDirs as $dir) {
    if (!is_dir($dir)) continue;
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($files as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $path = $file->getPathname();
            if (strpos($path, "ServerExpiryBadge.tsx") !== false) continue;
            $c = file_get_contents($path);
            if (strpos($c, "ServerExpiryBadge") !== false || strpos($c, "ARIX SERVER EXPIRY BADGE") !== false) {
                $c = preg_replace("/\/\*\s*>>>\s*ARIX SERVER EXPIRY BADGE START\s*>>>\s*\*\/[\s\S]*?\/\*\s*<<<\s*ARIX SERVER EXPIRY BADGE END\s*<<<\s*\*\/\s*/s", "", $c);
                $c = preg_replace("/\{?\/\*\s*>>>\s*ARIX SERVER EXPIRY BADGE START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX SERVER EXPIRY BADGE END\s*<<<\s*\*\/\}?\s*/s", "", $c);
                $c = preg_replace("/<ServerExpiryBadge[^>]*\/>\s*/s", "", $c);
                $c = preg_replace("/import\s+ServerExpiryBadge\s+from\s+[^;]+;\s*/s", "", $c);
                $c = preg_replace("/(\{\s*(?:server|data|srv|item|s)\??\.name\s*\})\s*\{\s*\}/s", "$1", $c);
                file_put_contents($path, $c);
                echo "[✓] Reverted ServerExpiryBadge patch in $path\n";
            }
        }
    }
}
