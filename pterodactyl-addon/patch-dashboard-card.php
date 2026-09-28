<?php

// patch-dashboard-card.php:
// 1. Injects ServerExpiryCard into the Server Dashboard directly beneath stat cards.
// 2. Injects ServerExpiryBadge next to server name on the main Dashboard Server Cards/Rows.

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
        }
    }
}

// --------------------------------------------------------------------------------------
// PART 2: Injects ServerExpiryBadge next to server name on Dashboard Server Card / Row
// --------------------------------------------------------------------------------------
$dashDir = "resources/scripts/components/dashboard";
if (is_dir($dashDir)) {
    $dashFiles = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dashDir));
    foreach ($dashFiles as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $filePath = $file->getPathname();
            // Skip the badge component itself
            if (strpos($filePath, "ServerExpiryBadge") !== false) continue;

            $c = file_get_contents($filePath);

            // Clean up any previous badge patch
            $c = preg_replace("/\/\*\s*>>>\s*ARIX SERVER EXPIRY BADGE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX SERVER EXPIRY BADGE END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/\{?\/\*\s*>>>\s*ARIX SERVER EXPIRY BADGE START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX SERVER EXPIRY BADGE END\s*<<<\s*\*\/\}?\s*/s", "", $c);

            $badgePatched = false;

            if (strpos($c, "{server.name}") !== false) {
                // Ensure import
                if (strpos($c, "import ServerExpiryBadge") === false) {
                    $import = "/* >>> ARIX SERVER EXPIRY BADGE START >>> */\nimport ServerExpiryBadge from \x27@/components/dashboard/ServerExpiryBadge\x27;\n/* <<< ARIX SERVER EXPIRY BADGE END <<< */\n";
                    $c = $import . $c;
                }

                $badgeJsx = '{server.name}{/* >>> ARIX SERVER EXPIRY BADGE START >>> */}<ServerExpiryBadge expireAt={(server as any).expire_at || (server as any).expireAt} className={"ml-2"} />{/* <<< ARIX SERVER EXPIRY BADGE END <<< */}';
                $c = preg_replace('/\{server\.name\}/', $badgeJsx, $c, 1);
                $badgePatched = true;
            } elseif (strpos($c, "{data.name}") !== false && (strpos($c, "Manage server") !== false || strpos($c, "Manage Server") !== false || strpos($c, "server") !== false)) {
                // Ensure import
                if (strpos($c, "import ServerExpiryBadge") === false) {
                    $import = "/* >>> ARIX SERVER EXPIRY BADGE START >>> */\nimport ServerExpiryBadge from \x27@/components/dashboard/ServerExpiryBadge\x27;\n/* <<< ARIX SERVER EXPIRY BADGE END <<< */\n";
                    $c = $import . $c;
                }

                $badgeJsx = '{data.name}{/* >>> ARIX SERVER EXPIRY BADGE START >>> */}<ServerExpiryBadge expireAt={(data as any).expire_at || (data as any).expireAt} className={"ml-2"} />{/* <<< ARIX SERVER EXPIRY BADGE END <<< */}';
                $c = preg_replace('/\{data\.name\}/', $badgeJsx, $c, 1);
                $badgePatched = true;
            }

            if ($badgePatched) {
                file_put_contents($filePath, $c);
                echo "[✓] Injected ServerExpiryBadge next to server name in $filePath\n";
            }
        }
    }
}
