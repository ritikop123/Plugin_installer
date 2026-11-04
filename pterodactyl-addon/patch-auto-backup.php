<?php

// =========================================================================
//  Arix Theme Automated Backup & Google Drive Addon Patcher
// =========================================================================

echo "[*] Applying Automated Backup & Google Drive Addon patches...\n";

$backupDir = "resources/scripts/components/server/backups";
if (!is_dir($backupDir)) {
    echo "[!] Backup directory not found at: {$backupDir}\n";
    exit(0);
}

// -------------------------------------------------------------------------
// PART 1: Patch BackupContainer.tsx
// Injects GoogleDriveBackupButton (D) and AutoBackupButton (A) cleanly wrapped
// -------------------------------------------------------------------------
$containerFiles = [
    "{$backupDir}/BackupContainer.tsx",
    "{$backupDir}/index.tsx",
];

foreach ($containerFiles as $containerFile) {
    if (!file_exists($containerFile)) continue;

    exec("git checkout HEAD -- " . escapeshellarg($containerFile) . " 2>/dev/null");

    $c = file_get_contents($containerFile);

    // Clean previous injections
    $c = preg_replace("/\{\s*\/\*\s*>>>\s*ARIX BACKUP BUTTONS START[\s\S]*?ARIX BACKUP BUTTONS END\s*<<<\s*\*\/[\s\r\n]*\}/s", "", $c);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX BACKUP BUTTONS START[\s\S]*?ARIX BACKUP BUTTONS END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/import\s+AutoBackupButton\s+from\s+[^;]+;\s*/s", "", $c);
    $c = preg_replace("/import\s+GoogleDriveBackupButton\s+from\s+[^;]+;\s*/s", "", $c);
    $c = preg_replace("/<div[^>]*inline-flex[^>]*>\s*<AutoBackupButton[^>]*\/>\s*(<CreateBackupButton[\s\S]*?\/>)\s*<\/div>/i", "$1", $c);
    $c = preg_replace("/<div[^>]*justify-end[^>]*>\s*<GoogleDriveBackupButton[^>]*\/>\s*<\/div>\s*/i", "", $c);

    // Add imports
    $imports = "import AutoBackupButton from '@/components/server/backups/AutoBackupButton';\nimport GoogleDriveBackupButton from '@/components/server/backups/GoogleDriveBackupButton';\n";
    $c = $imports . $c;

    // 1. Inject GoogleDriveBackupButton (Button D) at top right above ItemList / under ServerContentBlock
    if (preg_match('/(<(?:ServerContentBlock|PageContentBlock)[^>]*>)/i', $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[1][1] + strlen($m[1][0]);
        $gdriveJsx = "\n            <div className={'flex justify-end mb-3 -mt-1'}>\n                <GoogleDriveBackupButton />\n            </div>";
        $c = substr($c, 0, $pos) . $gdriveJsx . substr($c, $pos);
    } elseif (preg_match('/(<FlashMessageRender[\s\S]*?\/>)/i', $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[1][1];
        $gdriveJsx = "<div className={'flex justify-end mb-3 -mt-1'}>\n                <GoogleDriveBackupButton />\n            </div>\n            ";
        $c = substr($c, 0, $pos) . $gdriveJsx . substr($c, $pos);
    }

    // 2. Wrap <CreateBackupButton ... /> with AutoBackupButton in a single <div>
    // NOTE: DO NOT use {/* */} comment inside JS expression { ... && ( ... ) }
    if (preg_match('/(<CreateBackupButton[\s\S]*?\/>)/i', $c, $m, PREG_OFFSET_CAPTURE)) {
        $createBtnTag = $m[1][0];
        $pos = $m[1][1];
        $wrapped = "/* >>> ARIX BACKUP BUTTONS START >>> */\n                        <div className={'inline-flex items-center gap-2'}>\n                            <AutoBackupButton />\n                            " . $createBtnTag . "\n                        </div>\n                        /* <<< ARIX BACKUP BUTTONS END <<< */";
        $c = substr($c, 0, $pos) . $wrapped . substr($c, $pos + strlen($createBtnTag));
    }

    file_put_contents($containerFile, $c);
    echo "[✓] Injected wrapped backup buttons cleanly into: {$containerFile}\n";
}

// -------------------------------------------------------------------------
// PART 2: Patch BackupRow.tsx
// Badges automated backups with [Automated] tag and clock icon
// -------------------------------------------------------------------------
$backupRowFile = "{$backupDir}/BackupRow.tsx";
if (file_exists($backupRowFile)) {
    exec("git checkout HEAD -- " . escapeshellarg($backupRowFile) . " 2>/dev/null");
    $c = file_get_contents($backupRowFile);

    // Clean previous injections
    $c = preg_replace("/\{\s*\/\*\s*>>>\s*ARIX AUTOMATED BADGE START[\s\S]*?ARIX AUTOMATED BADGE END\s*<<<\s*\*\/[\s\r\n]*\}/s", "", $c);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTOMATED BADGE START[\s\S]*?ARIX AUTOMATED BADGE END\s*<<<\s*\*\/\s*/s", "", $c);

    // Add fontawesome icon if needed
    if (strpos($c, 'faClock') === false) {
        $c = preg_replace('/(import\s*\{[^}]*?)(\}\s*from\s*[\x27\x22]@fortawesome\/free-solid-svg-icons[\x27\x22])/', '$1, faClock $2', $c, 1);
    }

    // Inject badge right after backup name
    $pattern = '/(\{backup\.name\})/i';
    if (preg_match($pattern, $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[1][1] + strlen($m[1][0]);
        $badgeJsx = "{backup.name.toLowerCase().includes('automated') && (\n                    <span className={'ml-2 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 inline-flex items-center gap-1.5 shadow-sm'}>\n                        <FontAwesomeIcon icon={faClock} className={'text-[9px] text-cyan-400'} />\n                        <span>Automated</span>\n                    </span>\n                )}";
        $c = substr($c, 0, $pos) . $badgeJsx . substr($c, $pos);
        file_put_contents($backupRowFile, $c);
        echo "[✓] Injected [Automated] badge into: {$backupRowFile}\n";
    }
}

// -------------------------------------------------------------------------
// PART 3: Register API Routes in routes/api-client.php
// -------------------------------------------------------------------------
$routesFile = "routes/api-client.php";
if (file_exists($routesFile)) {
    $c = file_get_contents($routesFile);

    // Clean previous route block
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO BACKUP START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO BACKUP END\s*<<<\s*\*\/\s*/s", "", $c);

    $routeBlock = <<<'PHP'
/* >>> ARIX AUTO BACKUP START >>> */
Route::group(['prefix' => '/servers/{server}/auto-backup'], function () {
    Route::get('/', [Client\Servers\AutoBackupController::class, 'index']);
    Route::post('/', [Client\Servers\AutoBackupController::class, 'update']);
    Route::post('/run', [Client\Servers\AutoBackupController::class, 'runNow']);
    Route::get('/gdrive-auth', [Client\Servers\AutoBackupController::class, 'gdriveAuth']);
    Route::post('/gdrive-connect', [Client\Servers\AutoBackupController::class, 'gdriveConnect']);
    Route::post('/gdrive-upload', [Client\Servers\AutoBackupController::class, 'gdriveUpload']);
    Route::post('/gdrive-disconnect', [Client\Servers\AutoBackupController::class, 'gdriveDisconnect']);
});
/* <<< ARIX AUTO BACKUP END <<< */

PHP;

    if (strpos($c, '/* >>> ARIX PLUGIN INSTALLER START >>> */') !== false) {
        $c = str_replace('/* >>> ARIX PLUGIN INSTALLER START >>> */', $routeBlock . "/* >>> ARIX PLUGIN INSTALLER START >>> */", $c);
    } else {
        $c .= "\n" . $routeBlock;
    }

    file_put_contents($routesFile, $c);
    echo "[✓] Registered Auto-Backup & Google Drive API routes in {$routesFile}\n";
}

// -------------------------------------------------------------------------
// PART 4: Schedule Command in app/Console/Kernel.php
// -------------------------------------------------------------------------
$kernelFile = "app/Console/Kernel.php";
if (file_exists($kernelFile)) {
    $c = file_get_contents($kernelFile);

    // Clean previous injection
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO BACKUP SCHEDULER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO BACKUP SCHEDULER END\s*<<<\s*\*\/\s*/s", "", $c);

    $scheduleBlock = <<<'PHP'
        /* >>> ARIX AUTO BACKUP SCHEDULER START >>> */
        $schedule->command('ptero:auto-backup')->everyMinute()->withoutOverlapping();
        /* <<< ARIX AUTO BACKUP SCHEDULER END <<< */

PHP;

    $pattern = '/(protected function schedule\(Schedule \$schedule\)(?::\s*void)?\s*\{)/';
    if (preg_match($pattern, $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[1][1] + strlen($m[1][0]);
        $c = substr($c, 0, $pos) . "\n" . $scheduleBlock . substr($c, $pos);
        file_put_contents($kernelFile, $c);
        echo "[✓] Scheduled 'ptero:auto-backup' command in {$kernelFile}\n";
    }
}

echo "[✓] Automated Backup & Google Drive Addon patched successfully!\n";
