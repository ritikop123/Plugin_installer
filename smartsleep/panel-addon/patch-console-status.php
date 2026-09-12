<?php

// patch-console-status.php: Injects SmartSleepStatus into ServerConsoleContainer.tsx (and Arix dashboard)

$baseDir = "resources/scripts/components/server";
if (!is_dir($baseDir)) {
    echo "[!] Directory $baseDir not found. Skipping console status patch.\n";
    exit(0);
}

// 1. Target ServerConsoleContainer.tsx
$consoleFile = "resources/scripts/components/server/console/ServerConsoleContainer.tsx";
if (file_exists($consoleFile)) {
    $content = file_get_contents($consoleFile);

    // Clean up any old injection (banner or status)
    $content = preg_replace("/\/\*\s*>>>\s*SMARTSLEEP (BANNER|STATUS) START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*SMARTSLEEP (BANNER|STATUS) END\s*<<<\s*\*\/\s*/s", "", $content);
    $content = preg_replace("/\{?\/\*\s*>>>\s*SMARTSLEEP (BANNER|STATUS) START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*SMARTSLEEP (BANNER|STATUS) END\s*<<<\s*\*\/\}?\s*/s", "", $content);
    $content = preg_replace("/import SmartSleepConsoleBanner[^;]+;\s*/", "", $content);
    $content = preg_replace("/import SmartSleepStatus[^;]+;\s*/", "", $content);

    // Add import
    $import = "/* >>> SMARTSLEEP STATUS START >>> */\nimport SmartSleepStatus from '@/components/server/smartsleep/SmartSleepStatus';\n/* <<< SMARTSLEEP STATUS END <<< */\n";
    $content = $import . $content;

    // Inject JSX
    $jsx = "{/* >>> SMARTSLEEP STATUS START >>> */}\n            <SmartSleepStatus />\n            {/* <<< SMARTSLEEP STATUS END <<< */}\n";

    $patched = false;
    if (strpos($content, "<StatGraphs") !== false) {
        $content = preg_replace("/(<StatGraphs)/", $jsx . "            $1", $content, 1);
        $patched = true;
    } elseif (strpos($content, "<Console") !== false) {
        $content = preg_replace("/(<Console)/", $jsx . "            $1", $content, 1);
        $patched = true;
    } elseif (preg_match("/(<div className=[\"'][^\"']*grid[^\"']*[\"'][^>]*>)/", $content, $matches)) {
        $content = str_replace($matches[1], $matches[1] . "\n" . $jsx, $content);
        $patched = true;
    }

    if ($patched) {
        file_put_contents($consoleFile, $content);
        echo "[✓] Injected SmartSleepStatus into $consoleFile\n";
    }
}

// 2. Also check for Arix theme dashboard container if present
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($baseDir));
foreach ($files as $file) {
    if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
        $filePath = $file->getPathname();
        $c = file_get_contents($filePath);
        if (strpos($c, "dashboardWidgets") !== false) {
            // Clean old
            $c = preg_replace("/\/\*\s*>>>\s*SMARTSLEEP (BANNER|STATUS) START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*SMARTSLEEP (BANNER|STATUS) END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/\{?\/\*\s*>>>\s*SMARTSLEEP (BANNER|STATUS) START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*SMARTSLEEP (BANNER|STATUS) END\s*<<<\s*\*\/\}?\s*/s", "", $c);
            $c = preg_replace("/import SmartSleepConsoleBanner[^;]+;\s*/", "", $c);
            $c = preg_replace("/import SmartSleepStatus[^;]+;\s*/", "", $c);

            // Import
            $c = "/* >>> SMARTSLEEP STATUS START >>> */\nimport SmartSleepStatus from '@/components/server/smartsleep/SmartSleepStatus';\n/* <<< SMARTSLEEP STATUS END <<< */\n" . $c;

            $dashJsx = "\n{/* >>> SMARTSLEEP STATUS START >>> */}\n                        <div className={'col-span-full w-full'}>\n                            <SmartSleepStatus />\n                        </div>\n                        {/* <<< SMARTSLEEP STATUS END <<< */}\n";
            if (preg_match("/(dashboardWidgets\.map[\s\S]*?\)\s*(\)|;)?\s*\}\s*)/", $c, $matches)) {
                $target = $matches[1];
                $c = str_replace($target, $dashJsx . "\n" . $target, $c);
                file_put_contents($filePath, $c);
                echo "[✓] Injected SmartSleepStatus into Arix dashboard: $filePath\n";
            }
            break;
        }
    }
}
