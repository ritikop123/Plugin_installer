<?php

// patch-ai-assistant.php:
// 1. Cleans up any misplaced AiConsoleButton from cards/banners/previews.
// 2. Injects AiConsoleButton ONLY into ServerConsoleContainer / DashboardContainer.
// 3. Registers backend API routes in routes/api-client.php.
// 4. Registers frontend route /ai in resources/scripts/routers/routes.ts with permission 'file.*'.

echo "[*] Patching AI Assistant integration safely...\n";

// -------------------------------------------------------------
// PART 1A: Clean up misplaced AiConsoleButton across all files
// -------------------------------------------------------------
$cleanDirs = [
    "resources/scripts/components",
    "resources/scripts/routers",
];

$validTargets = [
    realpath("resources/scripts/components/server/console/ServerConsoleContainer.tsx"),
    realpath("resources/scripts/components/server/ServerConsoleContainer.tsx"),
    realpath("resources/scripts/components/server/dashboard/DashboardContainer.tsx"),
];
$validTargets = array_filter($validTargets);

foreach ($cleanDirs as $dir) {
    if (!is_dir($dir)) continue;
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir));
    foreach ($iterator as $file) {
        if ($file->isFile() && preg_match("/\.(tsx|ts)$/", $file->getFilename())) {
            $fp = realpath($file->getPathname()) ?: $file->getPathname();
            if (strpos($fp, "AiConsoleButton.tsx") !== false || strpos($fp, "AiConsoleModal.tsx") !== false || strpos($fp, "AiAssistantContainer.tsx") !== false) {
                continue;
            }

            $c = file_get_contents($fp);
            $orig = $c;

            $c = preg_replace("/\/\*\s*>>>\s*ARIX AI BUTTON START\s*>>>\s*\*\/[\s\S]*?\/\*\s*<<<\s*ARIX AI BUTTON END\s*<<<\s*\*\/\s*/s", "", $c);
            $c = preg_replace("/\{?\/\*\s*>>>\s*ARIX AI BUTTON START\s*>>>\s*\*\/\}?[\s\S]*?\{?\/\*\s*<<<\s*ARIX AI BUTTON END\s*<<<\s*\*\/\}?\s*/s", "", $c);
            $c = preg_replace("/<AiConsoleButton[^>]*\/>\s*/s", "", $c);
            $c = preg_replace("/import\s+AiConsoleButton\s+from\s+[^;]+;\s*/s", "", $c);

            if ($c !== $orig) {
                file_put_contents($fp, $c);
                echo "[✓] Cleaned up AiConsoleButton from: $fp\n";
            }
        }
    }
}

// -------------------------------------------------------------
// PART 1B: Injects AiConsoleButton ONLY into real Console Containers
// -------------------------------------------------------------
$consoleCandidates = [
    "resources/scripts/components/server/console/ServerConsoleContainer.tsx",
    "resources/scripts/components/server/ServerConsoleContainer.tsx",
    "resources/scripts/components/server/dashboard/DashboardContainer.tsx",
];

foreach ($consoleCandidates as $consoleFile) {
    if (!file_exists($consoleFile)) continue;

    $c = file_get_contents($consoleFile);

    // Insert Import
    if (strpos($c, "import AiConsoleButton") === false) {
        $c = "import AiConsoleButton from '@/components/server/AiConsoleButton';\n" . $c;
    }

    $buttonJsx = <<<'JSX'
{/* >>> ARIX AI BUTTON START >>> */}
                <div className={'mb-3 flex items-center justify-end'}>
                    <AiConsoleButton />
                </div>
                {/* <<< ARIX AI BUTTON END <<< */}
JSX;

    $injected = false;

    // Pattern 1: Right before <Console
    if (preg_match('/(<(?:div|div[^>]*)>\s*<Console[\s\S]*?>)/', $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[1][1];
        $c = substr($c, 0, $pos) . $buttonJsx . "\n                " . substr($c, $pos);
        $injected = true;
    } elseif (strpos($c, "<StatGraphs") !== false) {
        $pattern = '/(<StatGraphs[^>]*\/>)/';
        if (preg_match($pattern, $c, $m, PREG_OFFSET_CAPTURE)) {
            $pos = $m[1][1] + strlen($m[1][0]);
            $c = substr($c, 0, $pos) . "\n" . $buttonJsx . substr($c, $pos);
            $injected = true;
        }
    }

    if ($injected) {
        file_put_contents($consoleFile, $c);
        echo "[✓] Injected AiConsoleButton cleanly into console container: $consoleFile\n";
        break; // Only inject into the primary console container
    }
}

// -------------------------------------------------------------
// PART 2: Routes in routes/api-client.php
// -------------------------------------------------------------
$routesPhp = 'routes/api-client.php';
if (file_exists($routesPhp)) {
    $c = file_get_contents($routesPhp);

    // Clean old block
    $c = preg_replace('/\/\*\s*>>>\s*ARIX AI ASSISTANT START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AI ASSISTANT END\s*<<<\s*\*\/\s*/s', '', $c);
    $c = preg_replace('/Route::group\(\[\x27prefix\x27\s*=>\s*[\x27\x22]\/servers\/\{server\}\/ai[\x27\x22]\],.*?\}\);\s*/s', '', $c);

    $aiRoutes = <<<'PHP_ROUTES'

/* >>> ARIX AI ASSISTANT START >>> */
Route::group(['prefix' => '/servers/{server}/ai'], function () {
    Route::get('/info', [Client\Servers\AiAssistantController::class, 'info']);
    Route::post('/diagnose', [Client\Servers\AiAssistantController::class, 'diagnose']);
    Route::post('/autofix', [Client\Servers\AiAssistantController::class, 'autofix']);
    Route::post('/chat', [Client\Servers\AiAssistantController::class, 'chat']);
});
/* <<< ARIX AI ASSISTANT END <<< */
PHP_ROUTES;

    $c = rtrim($c) . "\n" . $aiRoutes . "\n";
    file_put_contents($routesPhp, $c);
    echo "[✓] Registered AI routes in routes/api-client.php\n";
}

// -------------------------------------------------------------
// PART 3: Routes in resources/scripts/routers/routes.ts
// -------------------------------------------------------------
$routesTs = 'resources/scripts/routers/routes.ts';
if (file_exists($routesTs)) {
    $c = file_get_contents($routesTs);

    // Clean old import & route
    $c = preg_replace('/import\s+AiAssistantContainer[^\n]*\n?/s', '', $c);
    $c = preg_replace('/\s*\{\s*path:\s*[\x27\x22]\/ai[\x27\x22][^\}]*\},?/s', '', $c);
    $c = preg_replace('/[^\n]*AiAssistantContainer[^\n]*\n?/', '', $c);

    $import = "import AiAssistantContainer from '@/components/server/AiAssistantContainer';\n";
    $route = "\n        { path: '/ai', permission: 'file.*', name: 'AI Assistant', component: AiAssistantContainer, exact: true },";

    $c = $import . $c;
    $c = preg_replace('/(server:\s*\[)/', '$1' . $route, $c, 1);
    file_put_contents($routesTs, $c);
    echo "[✓] Registered /ai route in resources/scripts/routers/routes.ts\n";
}

// -------------------------------------------------------------
// PART 4: Ensure GROQ_MODEL in .env
// -------------------------------------------------------------
$envFile = '.env';
if (file_exists($envFile)) {
    $envContent = file_get_contents($envFile);
    if (strpos($envContent, 'GROQ_MODEL=') === false) {
        $envContent = rtrim($envContent) . "\nGROQ_MODEL=allam-2-7b\n";
        file_put_contents($envFile, $envContent);
        echo "[✓] Configured GROQ_MODEL=allam-2-7b in .env\n";
    }
}

echo "[✓] AI Assistant patch safely completed!\n";
