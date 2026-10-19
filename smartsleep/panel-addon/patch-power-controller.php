<?php

$targetFile = 'app/Http/Controllers/Api/Client/Servers/PowerController.php';

if (!file_exists($targetFile)) {
    echo "[!] File $targetFile not found. Skipping legacy hook cleanup.\n";
    exit(0);
}

$content = file_get_contents($targetFile);
if ($content === false) {
    fwrite(STDERR, "[!] Could not read $targetFile.\n");
    exit(1);
}

$cleaned = preg_replace(
    '/\/\*\s*>>>\s*SMARTSLEEP POWER HOOK START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*SMARTSLEEP POWER HOOK END\s*<<<\s*\*\/\s*/s',
    '',
    $content
);

if ($cleaned === null) {
    fwrite(STDERR, "[!] Failed to remove the legacy SmartSleep power hook.\n");
    exit(1);
}

if ($cleaned !== $content && file_put_contents($targetFile, $cleaned) === false) {
    fwrite(STDERR, "[!] Could not write $targetFile.\n");
    exit(1);
}

echo "[✓] Legacy SmartSleep sleep/wake hook removed; native power actions are unchanged.\n";
