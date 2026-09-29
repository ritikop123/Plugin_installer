<?php

// patch-dashboard-card.php:
// 1. Injects ServerExpiryCard into the Server Console/Dashboard directly beneath stat cards.
// 2. Injects ServerExpiryBadge next to server name on Dashboard Server Cards & Server Console Header.
// 3. Injects ServerUptime next to Disk stat on Dashboard Server Cards & Server Console Header.

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
// PART 2: Injects ServerExpiryBadge next to server name on Dashboard Cards & Server Header
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

            // Cleanup any previous ServerUptime patches
            $c = preg_replace("/\{\s*\/\*\s*>>>\s*ARIX SERVER UPTIME START[\s\S]*?ARIX SERVER UPTIME END\s*<<<\s*\*\/[\s\r\n]*\}/s", "", $c);
            $c = preg_replace("/\/\*\s*>>>\s*ARIX SERVER UPTIME START[\s\S]*?ARIX SERVER UPTIME END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/<ServerUptime[^>]*\/>\s*/s", "", $c);
            $c = preg_replace("/import\s+ServerUptime\s+from\s+[^;]+;\s*/s", "", $c);

            if ($c !== $original) {
                file_put_contents($filePath, $c);
                echo "[✓] Cleaned up previous patch in: $filePath\n";
            }
        }
    }
}

// STEP 2B: Inject ServerExpiryBadge into card and banner components
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

                    // Standard double quotes for className - 100% valid JSX without any hex escape issues
                    $badge = $targetStr . ' <ServerExpiryBadge expireAt={(' . $varName . ' as any)?.expire_at || (' . $varName . ' as any)?.expireAt} className="ml-2 align-middle inline-flex" />';

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
// PART 3: Injects ServerUptime next to Disk stat on Dashboard Cards & Server Header
// --------------------------------------------------------------------------------------
$checkedUptimeFiles = [];

foreach ($scanDirs as $dir) {
    if (!is_dir($dir)) continue;

    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $filePath = realpath($file->getPathname()) ?: $file->getPathname();
            if (isset($checkedUptimeFiles[$filePath])) continue;
            $checkedUptimeFiles[$filePath] = true;

            $c = file_get_contents($filePath);

            if (!isServerCardOrBannerFile($filePath, $c)) continue;

            // Locate disk usage patterns
            $pattern = '/(?:limits\??\.disk|stats\??\.disk|disk_bytes|diskLimit)/';
            if (!preg_match_all($pattern, $c, $matches, PREG_OFFSET_CAPTURE)) {
                continue;
            }

            // Collect match positions and process in reverse order so offsets remain stable
            $positions = [];
            foreach ($matches[0] as $m) {
                $positions[] = $m[1];
            }
            $positions = array_reverse($positions);

            $usedOffsets = [];
            $modified = false;

            // Determine stats variable name
            $statsVar = 'stats';
            if (preg_match('/([a-zA-Z0-9_$]+)\??\.disk/', $c, $statVarMatch)) {
                $candidate = $statVarMatch[1];
                if ($candidate !== 'limits' && $candidate !== 'server' && $candidate !== 'srv') {
                    $statsVar = $candidate;
                }
            } elseif (strpos($c, 'stats?.') === false && strpos($c, 'stats.') === false && strpos($c, 'serverStats') !== false) {
                $statsVar = 'serverStats';
            }

            foreach ($positions as $diskPos) {
                $sub = substr($c, $diskPos);
                if (preg_match('/^(?:(?!\<\/(?:div|span|p)\>).)*?(<\/span\s*>\s*<\/div\s*>|<\/div\s*>|<\/span\s*>|<\/p\s*>)/s', $sub, $closeMatch, PREG_OFFSET_CAPTURE)) {
                    $closeOffset = $closeMatch[1][1];
                    $closeLen = strlen($closeMatch[1][0]);
                    $insertOffset = $diskPos + $closeOffset + $closeLen;

                    if (in_array($insertOffset, $usedOffsets)) {
                        continue;
                    }
                    $usedOffsets[] = $insertOffset;

                    // Check if the container row already has gap- or space-x-
                    $beforeDisk = substr($c, max(0, $diskPos - 300), min(300, $diskPos));
                    $hasGap = preg_match('/(?:gap-|space-x-)/', $beforeDisk);
                    $classNameProp = $hasGap ? '' : ' className="ml-4"';

                    $uptimeJsx = ' <ServerUptime stats={' . $statsVar . '}' . $classNameProp . ' />';

                    $c = substr($c, 0, $insertOffset) . $uptimeJsx . substr($c, $insertOffset);
                    $modified = true;
                }
            }

            if ($modified) {
                // Add clean import at the top
                if (strpos($c, "import ServerUptime") === false) {
                    $import = "import ServerUptime from '@/components/dashboard/ServerUptime';\n";
                    $c = $import . $c;
                }

                file_put_contents($filePath, $c);
                echo "[✓] Injected ServerUptime next to disk stat in: $filePath\n";
            }
        }
    }
}
