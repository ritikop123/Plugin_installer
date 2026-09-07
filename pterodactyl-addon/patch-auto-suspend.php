<?php

// Patch 1: resources/views/admin/servers/new.blade.php (Creation Page)
$newBladeFile = 'resources/views/admin/servers/new.blade.php';
if (file_exists($newBladeFile)) {
    $c = file_get_contents($newBladeFile);
    $c = preg_replace('/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s', '', $c);
    $card = <<<'CARD'
<!-- >>> ARIX AUTO SUSPENSION START >>> -->
    <div class="row">
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Auto Suspension</h3>
                </div>
                <div class="box-body">
                    <div class="form-group">
                        <label for="pExpireAt">Expiration Date</label>
                        <input type="datetime-local" class="form-control" id="pExpireAt" name="expire_at" value="{{ old('expire_at') }}">
                        <p class="small text-muted no-margin">The date when this server will be automatically suspended. Leave empty for no expiration.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
<!-- <<< ARIX AUTO SUSPENSION END <<< -->

CARD;
    if (strpos($c, '<h3 class="box-title">Core Details</h3>') !== false) {
        $c = preg_replace('/(\s*<div class="row">\s*<div class="col-xs-12">\s*<div class="box">\s*<div class="box-header with-border">\s*<h3 class="box-title">Core Details<\/h3>)/', "\n" . $card . '$1', $c, 1);
        file_put_contents($newBladeFile, $c);
    }
}

// Patch 2: resources/views/admin/servers/view/build.blade.php (Build Configuration Page - already created servers)
$buildBladeFile = 'resources/views/admin/servers/view/build.blade.php';
if (file_exists($buildBladeFile)) {
    $c = file_get_contents($buildBladeFile);
    $c = preg_replace('/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s', '', $c);
    $card = <<<'CARD'
<!-- >>> ARIX AUTO SUSPENSION START >>> -->
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Auto Suspension</h3>
                </div>
                <div class="box-body">
                    <div class="form-group">
                        <label for="pExpireAt">Expiration Date</label>
                        <input type="datetime-local" class="form-control" id="pExpireAt" name="expire_at" value="{{ old('expire_at', $server->expire_at ? $server->expire_at->format('Y-m-d\TH:i') : '') }}">
                        <p class="small text-muted no-margin">The date when this server will be automatically suspended. Leave empty for no expiration.</p>
                    </div>
                </div>
            </div>
        </div>
<!-- <<< ARIX AUTO SUSPENSION END <<< -->

CARD;
    if (strpos($c, 'admin.servers.view.build') !== false) {
        $c = preg_replace('/(<form action="\{\{\s*route\(\x27admin\.servers\.view\.build\x27,\s*\$server->id\)\s*\}\}" method="POST">\s*)/', "$1" . $card, $c, 1);
        file_put_contents($buildBladeFile, $c);
    }
}

// Patch 3: resources/views/admin/servers/view/details.blade.php (Details Page)
$detailsBladeFile = 'resources/views/admin/servers/view/details.blade.php';
if (file_exists($detailsBladeFile)) {
    $c = file_get_contents($detailsBladeFile);
    $c = preg_replace('/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s', '', $c);
    $field = <<<'FIELD'
<!-- >>> ARIX AUTO SUSPENSION START >>> -->
                    <div class="form-group">
                        <label for="pExpireAt" class="control-label">Expiration Date (Auto Suspension)</label>
                        <input type="datetime-local" name="expire_at" id="pExpireAt" value="{{ old('expire_at', $server->expire_at ? $server->expire_at->format('Y-m-d\TH:i') : '') }}" class="form-control" />
                        <p class="text-muted small">The date when this server will be automatically suspended. Leave empty or clear to disable auto-suspension.</p>
                    </div>
<!-- <<< ARIX AUTO SUSPENSION END <<< -->

FIELD;
    if (strpos($c, 'name="description"') !== false) {
        $c = preg_replace('/(<\/div>\s*<\/div>\s*<div class="box-footer">)/', $field . '$1', $c, 1);
        file_put_contents($detailsBladeFile, $c);
    }
}

// Patch 4: app/Http/Controllers/Admin/Servers/CreateServerController.php
$createCtrlFile = 'app/Http/Controllers/Admin/Servers/CreateServerController.php';
if (file_exists($createCtrlFile)) {
    $c = file_get_contents($createCtrlFile);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s', '', $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        if ($request->filled('expire_at')) {
            try {
                $server->expire_at = \Carbon\Carbon::parse($request->input('expire_at'));
                $server->save();
            } catch (\Throwable $e) {
                \Log::warning('Could not set expire_at for new server: ' . $e->getMessage());
            }
        }
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (strpos($c, '$server = $this->creationService->handle($data);') !== false) {
        $c = preg_replace('/(\$server = \$this->creationService->handle\(\$data\);\s*)/', '$1' . $patch, $c, 1);
        file_put_contents($createCtrlFile, $c);
    }
}

// Patch 5: app/Http/Controllers/Admin/ServersController.php
$serversCtrlFile = 'app/Http/Controllers/Admin/ServersController.php';
if (file_exists($serversCtrlFile)) {
    $c = file_get_contents($serversCtrlFile);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s', '', $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        if ($request->has('expire_at')) {
            try {
                $newExpire = $request->filled('expire_at') ? \Carbon\Carbon::parse($request->input('expire_at')) : null;
                $server->expire_at = $newExpire;
                if (is_null($newExpire) || ($server->expiration_warning_sent_at && $newExpire->isAfter(\Carbon\Carbon::now()->addDays(3)))) {
                    $server->expiration_warning_sent_at = null;
                }
                $server->save();
            } catch (\Throwable $e) {
                \Log::warning('Could not update expire_at for server ' . $server->id . ': ' . $e->getMessage());
            }
        }
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (strpos($c, '$this->detailsModificationService->handle(') !== false) {
        $c = preg_replace('/(\$this->detailsModificationService->handle\([^\n]+\);\s*)/', '$1' . $patch, $c, 1);
    }
    if (strpos($c, 'alerts.build_updated') !== false) {
        $c = preg_replace('/(\$this->alert->success\(trans\(\x27admin\/server\.alerts\.build_updated\x27\)\)->flash\(\);\s*)/', $patch . '        $1', $c, 1);
    }
    file_put_contents($serversCtrlFile, $c);
}

// Patch 6: app/Console/Kernel.php
$kernelFile = 'app/Console/Kernel.php';
if (file_exists($kernelFile)) {
    $c = file_get_contents($kernelFile);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s', '', $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        $schedule->command('ptero:auto-suspend')->everyFiveMinutes()->withoutOverlapping();
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (strpos($c, 'protected function schedule(Schedule $schedule): void') !== false) {
        $c = preg_replace('/(protected function schedule\(Schedule \$schedule\): void\s*\{)/', "$1\n        " . $patch, $c, 1);
        file_put_contents($kernelFile, $c);
    }
}

// Patch 7: app/Models/Server.php
$modelFile = 'app/Models/Server.php';
if (file_exists($modelFile)) {
    $c = file_get_contents($modelFile);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s', '', $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        'expire_at' => 'datetime',
        'expiration_warning_sent_at' => 'datetime',
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (strpos($c, "'installed_at' => 'datetime',") !== false) {
        $c = preg_replace("/('installed_at' => 'datetime',\s*)/", "$1        " . $patch, $c, 1);
        file_put_contents($modelFile, $c);
    }
}
