<?php

// patch-dashboard-card.php:
// 1. Injects ServerExpiryCard into the Server Console/Dashboard directly beneath stat cards.
// 2. Injects ServerExpiryBadge next to server name on Dashboard Cards (marked area) & Server Console Header.
// 3. Injects ServerUptime and ServerSupportId next to Disk stat on the Server Console Header.

// -------------------------------------------------------------
// PART 1: Injects ServerExpiryCard into Server Console Container
// -------------------------------------------------------------
$baseDir = "resources/scripts/components/server";
if (is_dir($baseDir)) {
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

    if (!$dashboardFile) {
        $fallback = "resources/scripts/components/server/console/ServerConsoleContainer.tsx";
        if (file_exists($fallback)) {
            $dashboardFile = $fallback;
            echo "[*] Using console container: $dashboardFile\n";
        }
    }

    if ($dashboardFile && file_exists($dashboardFile)) {
        $content = file_get_contents($dashboardFile);

        // Clean up any existing patch
        $content = preg_replace("/\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/[\s\S]*?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\s*/s", "", $content);
        $content = preg_replace("/\{?\/\*\s*>>>\s*ARIX DASHBOARD CARD START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX DASHBOARD CARD END\s*<<<\s*\*\/\}?\s*/s", "", $content);

        // Ensure Import
        $importStatement = "/* >>> ARIX DASHBOARD CARD START >>> */\nimport ServerExpiryCard from '@/components/server/ServerExpiryCard';\n/* <<< ARIX DASHBOARD CARD END <<< */\n";
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
        }
    }
}

// --------------------------------------------------------------------------------------
// HELPER: Detect if a file is an outer or inner server card / banner
// --------------------------------------------------------------------------------------
function isServerCardOrBannerFile($filePath, $content) {
    if (strpos($filePath, "ServerExpiryBadge.tsx") !== false) return false;
    if (strpos($filePath, "ServerExpiryCard.tsx") !== false) return false;
    if (strpos($filePath, "ServerUptime.tsx") !== false) return false;
    if (strpos($filePath, "StatGraphs") !== false) return false;
    if (strpos($filePath, "StatBlock") !== false) return false;
    if (strpos($filePath, "Search") !== false) return false;
    if (strpos($filePath, "search") !== false) return false;
    if (strpos($filePath, "Modal") !== false) return false;

    // Check by filename
    $byName = (
        strpos($filePath, "ServerCard") !== false ||
        strpos($filePath, "CardBanner") !== false ||
        strpos($filePath, "ServerRow") !== false ||
        strpos($filePath, "LinearCard") !== false ||
        strpos($filePath, "NormalCard") !== false ||
        strpos($filePath, "ServerDetailsBlock") !== false ||
        strpos($filePath, "ServerDetails") !== false ||
        strpos($filePath, "ServerBanner") !== false ||
        strpos($filePath, "ServerHeader") !== false ||
        strpos($filePath, "DetailsBlock") !== false
    );

    if ($byName) return true;

    // Check by content: contains disk usage AND server info
    $hasDisk = preg_match('/(?:limits\??\.disk|stats\??\.disk|disk_bytes|diskLimit)/', $content);
    if (!$hasDisk) return false;

    $isCard = preg_match('/(?:allocations|server\.name|srv\.name|data\.name|PowerButtons|start)/i', $content);
    return (bool) $isCard;
}

// --------------------------------------------------------------------------------------
// PART 2: Injects ServerExpiryBadge next to server name on Dashboard Cards (marked area) & Server Header
// --------------------------------------------------------------------------------------
$scanDirs = [
    "resources/scripts/components/dashboard",
    "resources/scripts/components/server",
    "resources/scripts/components/arix",
    "resources/scripts/routers",
];

$checkedFiles = [];

// STEP 2A: Clean up ALL files in target folders first
foreach ($scanDirs as $dir) {
    if (!is_dir($dir)) continue;

    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $filePath = realpath($file->getPathname()) ?: $file->getPathname();
            if (isset($checkedFiles[$filePath])) continue;
            $checkedFiles[$filePath] = true;

            // Skip badge and uptime components themselves
            if (strpos($filePath, "ServerExpiryBadge.tsx") !== false) continue;
            if (strpos($filePath, "ServerExpiryCard.tsx") !== false) continue;
            if (strpos($filePath, "ServerUptime.tsx") !== false) continue;

            $c = file_get_contents($filePath);
            $original = $c;

            // Comprehensive Cleanup of any previous badge patches or corrupted tags
            $c = preg_replace("/\{\s*\/\*\s*>>>\s*ARIX SERVER EXPIRY BADGE START[\s\S]*?ARIX SERVER EXPIRY BADGE END\s*<<<\s*\*\/[\s\r\n]*\}/s", "", $c);
            $c = preg_replace("/\/\*\s*>>>\s*ARIX SERVER EXPIRY BADGE START[\s\S]*?ARIX SERVER EXPIRY BADGE END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/<ServerExpiryBadge[^>]*\/>\s*/s", "", $c);
            $c = preg_replace("/(\{\s*(?:server|data|srv|item|s)\??\.name\s*\})[\s\r\n]*\{\s*[\r\n\s]*\}/s", "$1", $c);
            $c = str_replace('\x27', "'", $c);
            $c = preg_replace("/import\s+ServerExpiryBadge\s+from\s+[^;]+;\s*/s", "", $c);

            // Cleanup any previous ServerUptime patches across all files
            $c = preg_replace("/\{\s*\/\*\s*>>>\s*ARIX SERVER UPTIME START[\s\S]*?ARIX SERVER UPTIME END\s*<<<\s*\*\/[\s\r\n]*\}/s", "", $c);
            $c = preg_replace("/\/\*\s*>>>\s*ARIX SERVER UPTIME START[\s\S]*?ARIX SERVER UPTIME END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/<ServerUptime[^>]*\/>\s*/s", "", $c);
            $c = preg_replace("/import\s+ServerUptime\s+from\s+[^;]+;\s*/s", "", $c);
            $c = preg_replace("/<ServerSupportId[^>]*\/>\s*/s", "", $c);
            $c = preg_replace("/import\s+ServerSupportId\s+from\s+[^;]+;\s*/s", "", $c);

            if ($c !== $original) {
                file_put_contents($filePath, $c);
                echo "[✓] Cleaned up previous patch in: $filePath\n";
            }
        }
    }
}

// STEP 2B: Inject ServerExpiryBadge into card and banner components (in the marked area next to server name)
$checkedCardFiles = [];

foreach ($scanDirs as $dir) {
    if (!is_dir($dir)) continue;

    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $filePath = realpath($file->getPathname()) ?: $file->getPathname();
            if (isset($checkedCardFiles[$filePath])) continue;
            $checkedCardFiles[$filePath] = true;

            $c = file_get_contents($filePath);

            if (!isServerCardOrBannerFile($filePath, $c)) continue;

            if (strpos($c, ".name") !== false || strpos($c, "{name}") !== false) {
                // Match {server.name} NOT preceded by = (JSX child text only, never attributes)
                $pattern = '/(?<!=)\s*(\{\s*(server|data|srv|item|s)\??\.name\s*\})/';

                if (preg_match($pattern, $c, $matches, PREG_OFFSET_CAPTURE)) {
                    $targetStr = $matches[1][0];
                    $varName = $matches[2][0];
                    $pos = $matches[1][1];
                    $len = strlen($targetStr);

                    // Robust prop lookup checking flat property, camelCase, and attributes object
                    $expireAtProp = '(' . $varName . ' as any)?.expire_at || (' . $varName . ' as any)?.expireAt || (' . $varName . ' as any)?.attributes?.expire_at || (' . $varName . ' as any)?.attributes?.expireAt';
                    $badge = $targetStr . ' <ServerExpiryBadge expireAt={' . $expireAtProp . '} className="ml-2 align-middle inline-flex" />';

                    // Replace only this exact instance
                    $c = substr_replace($c, $badge, $pos, $len);

                    // Add clean import at the top
                    if (strpos($c, "import ServerExpiryBadge") === false) {
                        $import = "import ServerExpiryBadge from '@/components/dashboard/ServerExpiryBadge';\n";
                        $c = $import . $c;
                    }

                    file_put_contents($filePath, $c);
                    echo "[✓] Injected ServerExpiryBadge next to server name in: $filePath\n";
                }
            }
        }
    }
}

// --------------------------------------------------------------------------------------
// PART 3: Injects ServerSupportId into Top Bar next to RAM (SlimBar & InformationBar)
// --------------------------------------------------------------------------------------
$topBarFiles = [
    "resources/scripts/routers/layouts/SlimBar.tsx",
    "resources/scripts/routers/layouts/InformationBar.tsx",
];

// Also discover any other router layout files
$layoutDir = "resources/scripts/routers/layouts";
if (is_dir($layoutDir)) {
    $foundLayouts = glob("$layoutDir/*.tsx");
    if ($foundLayouts) {
        foreach ($foundLayouts as $fl) {
            $normalized = str_replace('\\', '/', $fl);
            if (!in_array($normalized, $topBarFiles)) {
                $topBarFiles[] = $normalized;
            }
        }
    }
}

foreach ($topBarFiles as $filePath) {
    if (!file_exists($filePath)) continue;

    $c = file_get_contents($filePath);

    // Clean up any existing ServerSupportId
    $c = preg_replace("/<ServerSupportId[^>]*\/>\s*/s", "", $c);
    $c = preg_replace("/import\s+ServerSupportId\s+from\s+[^;]+;\s*/s", "", $c);

    // Match the RAM / Memory stick container:
    // <div className={'flex items-center gap-x-1'}> ... <LuMemoryStick ... </div>
    $memoryPattern = '/(<div[^>]*>\s*<LuMemoryStick[\s\S]*?<\/div>)/';

    if (preg_match($memoryPattern, $c, $m, PREG_OFFSET_CAPTURE)) {
        $matchedBlock = $m[1][0];
        $insertPos = $m[1][1] + strlen($matchedBlock);

        $supportIdJsx = "\n                        <ServerSupportId />";
        $c = substr($c, 0, $insertPos) . $supportIdJsx . substr($c, $insertPos);

        // Add clean import at the top
        if (strpos($c, "import ServerSupportId") === false) {
            $c = "import ServerSupportId from '@/components/server/ServerSupportId';\n" . $c;
        }

        file_put_contents($filePath, $c);
        echo "[✓] Injected ServerSupportId next to RAM stat in top bar: $filePath\n";
    }
}
