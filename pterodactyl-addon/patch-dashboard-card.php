<?php

// patch-dashboard-card.php: Injects ServerExpiryCard into the Server Dashboard directly beneath the stat cards.

$baseDir = "resources/scripts/components/server";
if (!is_dir($baseDir)) {
    echo "[!] Directory $baseDir not found. Skipping dashboard card patch.\n";
    exit(0);
}

// 1. Search for file containing "dashboardWidgets" (Arix Theme Dashboard)
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($baseDir));
$dashboardFile = null;

foreach ($files as $file) {
    if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
        $c = file_get_contents($file->getPathname());
        if (strpos($c, "dashboardWidgets") !== false) {
            $dashboardFile = $file->getPathname();
            echo "[✓] Located Arix dashboard container at: $dashboardFile\n";
            break;
        }
    }
}

// 2. Fallback to ServerConsoleContainer.tsx if separate dashboard file not found
if (!$dashboardFile) {
    $fallback = "resources/scripts/components/server/console/ServerConsoleContainer.tsx";
    if (file_exists($fallback)) {
        $dashboardFile = $fallback;
        echo "[*] Using console container: $dashboardFile\n";
    }
}

if (!$dashboardFile || !file_exists($dashboardFile)) {
    echo "[!] Could not locate server dashboard file.\n";
    exit(0);
}

$content = file_get_contents($dashboardFile);

// Clean up any existing patch
$content = preg_replace("/\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\s*/s", "", $content);
$content = preg_replace("/\{?\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\}?\s*/s", "", $content);

// Ensure Import
$importStatement = "/* >>> ARIX DASHBOARD CARD START >>> */\nimport ServerExpiryCard from \x27@/components/server/ServerExpiryCard\x27;\n/* <<< ARIX DASHBOARD CARD END <<< */\n";
if (strpos($content, "import ServerExpiryCard") === false) {
    $content = $importStatement . $content;
}

// Insert Card JSX
$cardJsx = <<<'JSX'
{/* >>> ARIX DASHBOARD CARD START >>> */}
                        <div className={"lg:col-span-2"}>
                            <ServerExpiryCard />
                        </div>
                        {/* <<< ARIX DASHBOARD CARD END <<< */}
JSX;

$patched = false;

// Case A: Arix dashboard with dashboardWidgets.map(...)
if (preg_match("/(dashboardWidgets\.map[\s\S]*?\)\s*(\)|;)?\s*\}\s*)/", $content, $matches)) {
    $target = $matches[1];
    $replacement = $target . "\n" . $cardJsx . "\n";
    $content = str_replace($target, $replacement, $content);
    $patched = true;
    echo "[✓] Injected ServerExpiryCard after dashboardWidgets map in $dashboardFile\n";
} elseif (strpos($content, "<StatGraphs") !== false) {
    // Case B: Standard Pterodactyl console container below StatGraphs
    $consoleCardJsx = <<<'CONSOLE_JSX'
{/* >>> ARIX DASHBOARD CARD START >>> */}
            <div className={"mt-4"}>
                <ServerExpiryCard />
            </div>
            {/* <<< ARIX DASHBOARD CARD END <<< */}
CONSOLE_JSX;
    $content = preg_replace("/(<\/div>\s*<Features enabled=)/", $consoleCardJsx . "\n            $1", $content, 1);
    $patched = true;
    echo "[✓] Injected ServerExpiryCard below StatGraphs in $dashboardFile\n";
}

if ($patched) {
    file_put_contents($dashboardFile, $content);
    echo "[✓] Dashboard card successfully patched!\n";
} else {
    echo "[!] Could not find injection point in $dashboardFile.\n";
}
