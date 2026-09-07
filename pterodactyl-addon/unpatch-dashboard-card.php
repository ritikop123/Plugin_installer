<?php

$baseDir = "resources/scripts/components/server";
if (!is_dir($baseDir)) {
    exit(0);
}

$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($baseDir));

foreach ($files as $file) {
    if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
        $path = $file->getPathname();
        $c = file_get_contents($path);
        if (strpos($c, "ARIX DASHBOARD CARD") !== false || strpos($c, "ServerExpiryCard") !== false) {
            $c = preg_replace("/\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/\{?\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\}?\s*/s", "", $c);
            file_put_contents($path, $c);
            echo "[✓] Reverted dashboard card patch in $path\n";
        }
    }
}
