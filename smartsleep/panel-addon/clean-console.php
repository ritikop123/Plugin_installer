<?php

// clean-console.php: Thoroughly removes any SmartSleep console injections from all files

$baseDir = "resources/scripts/components/server";
if (is_dir($baseDir)) {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($baseDir));
    foreach ($files as $file) {
        if ($file->isFile() && preg_match('/\.(tsx|ts)$/', $file->getFilename())) {
            $filePath = $file->getPathname();
            $content = file_get_contents($filePath);
            $orig = $content;

            // Remove banners / status blocks
            $content = preg_replace('/\/\*\s*>>>\s*SMARTSLEEP (BANNER|STATUS) START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*SMARTSLEEP (BANNER|STATUS) END\s*<<<\s*\*\/\s*/s', '', $content);
            $content = preg_replace('/\{?\/\*\s*>>>\s*SMARTSLEEP (BANNER|STATUS) START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*SMARTSLEEP (BANNER|STATUS) END\s*<<<\s*\*\/\}?\s*/s', '', $content);
            $content = preg_replace('/import SmartSleepConsoleBanner[^;]+;\s*/', '', $content);
            $content = preg_replace('/import SmartSleepStatus[^;]+;\s*/', '', $content);
            $content = preg_replace('/<SmartSleepConsoleBanner\s*\/>\s*/', '', $content);
            $content = preg_replace('/<SmartSleepStatus\s*\/>\s*/', '', $content);

            if ($content !== $orig) {
                file_put_contents($filePath, $content);
                echo "[✓] Cleaned SmartSleep console injection from: " . $filePath . "\n";
            }
        }
    }
}
