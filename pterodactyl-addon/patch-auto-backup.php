<?php

// =========================================================================
//  Arix Theme Automated Backup & Google Drive Addon Patcher
// =========================================================================

echo "[*] Applying Automated Backup & Google Drive Addon patches...\n";

$backupDir = "resources/scripts/components/server/backups";

// -------------------------------------------------------------------------
// PART 0: Restore pristine CreateBackupButton.tsx from git HEAD
// Ensures the manual "Create backup" button is fully intact and clean
// -------------------------------------------------------------------------
$createBtnFile = "{$backupDir}/CreateBackupButton.tsx";
if (file_exists($createBtnFile)) {
    exec("git checkout -f HEAD -- " . escapeshellarg($createBtnFile) . " 2>/dev/null");
    echo "[✓] Restored pristine CreateBackupButton.tsx from git\n";
}

// -------------------------------------------------------------------------
// PART 1: Patch BackupRow.tsx
// Badges automated backups with [Automated] tag and clock icon
// -------------------------------------------------------------------------
$backupRowFile = "{$backupDir}/BackupRow.tsx";
if (file_exists($backupRowFile)) {
    $c = file_get_contents($backupRowFile);

    // Clean previous injections
    $c = preg_replace("/\{\s*\/\*\s*>>>\s*ARIX AUTOMATED BADGE START[\s\S]*?ARIX AUTOMATED BADGE END\s*<<<\s*\*\/[\s\r\n]*\}/s", "", $c);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTOMATED BADGE START[\s\S]*?ARIX AUTOMATED BADGE END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/\{backup\.name\.toLowerCase\(\)\.includes\([\x27\x22]automated[\x27\x22]\)[\s\S]*?<\/span>\s*\)\s*\}/s", "", $c);

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
// PART 2: Register API Routes in routes/api-client.php
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
// PART 3: Schedule Command in app/Console/Kernel.php
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
