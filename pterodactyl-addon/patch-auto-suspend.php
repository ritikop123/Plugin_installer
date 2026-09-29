<?php

// Patch 1: resources/views/admin/servers/new.blade.php (Creation Page)
$newBladeFile = "resources/views/admin/servers/new.blade.php";
if (file_exists($newBladeFile)) {
    $c = file_get_contents($newBladeFile);
    $c = preg_replace("/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s", "", $c);
    $card = <<<'CARD'
<!-- >>> ARIX AUTO SUSPENSION START >>> -->
    <div class="row">
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Plan & Expiration (Auto Suspension)</h3>
                </div>
                <div class="box-body">
                    <div class="row">
                        <div class="form-group col-xs-12 col-md-4">
                            <label for="pExpireAt">Expiration Date</label>
                            <input type="datetime-local" class="form-control" id="pExpireAt" name="expire_at" value="{{ old("expire_at") }}">
                            <p class="small text-muted no-margin">The date when this server will be automatically suspended. Leave empty for no expiration.</p>
                        </div>
                        <div class="form-group col-xs-12 col-md-4">
                            <label for="pPlanName">Plan Name</label>
                            <input type="text" class="form-control" id="pPlanName" name="plan_name" value="{{ old("plan_name") }}" placeholder="e.g. Starter 4GB, Premium Gold">
                            <p class="small text-muted no-margin">Plan identifier displayed on the server dashboard (auto-detects from specs if empty).</p>
                        </div>
                        <div class="form-group col-xs-12 col-md-4">
                            <label for="pPlanPrice">Plan Price</label>
                            <input type="text" class="form-control" id="pPlanPrice" name="plan_price" value="{{ old("plan_price") }}" placeholder="e.g. $10.00/mo, ₹499/mo, Free">
                            <p class="small text-muted no-margin">Plan pricing displayed on the server dashboard (shows Free / Included if empty).</p>
                        </div>
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
$buildBladeFile = "resources/views/admin/servers/view/build.blade.php";
if (file_exists($buildBladeFile)) {
    $c = file_get_contents($buildBladeFile);
    $c = preg_replace("/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s", "", $c);
    $card = <<<'CARD'
<!-- >>> ARIX AUTO SUSPENSION START >>> -->
        <div class="col-xs-12">
            <div class="box">
                <div class="box-header with-border">
                    <h3 class="box-title">Plan & Expiration (Auto Suspension)</h3>
                </div>
                <div class="box-body">
                    <div class="row">
                        <div class="form-group col-xs-12 col-md-4">
                            <label for="pExpireAt">Expiration Date</label>
                            <input type="datetime-local" class="form-control" id="pExpireAt" name="expire_at" value="{{ old("expire_at", $server->expire_at ? $server->expire_at->format("Y-m-d\TH:i") : "") }}">
                            <p class="small text-muted no-margin">The date when this server will be automatically suspended. Leave empty for no expiration.</p>
                        </div>
                        <div class="form-group col-xs-12 col-md-4">
                            <label for="pPlanName">Plan Name</label>
                            <input type="text" class="form-control" id="pPlanName" name="plan_name" value="{{ old("plan_name", $server->plan_name) }}" placeholder="e.g. Starter 4GB, Premium Gold">
                            <p class="small text-muted no-margin">Plan identifier displayed on the server dashboard (auto-detects from specs if empty).</p>
                        </div>
                        <div class="form-group col-xs-12 col-md-4">
                            <label for="pPlanPrice">Plan Price</label>
                            <input type="text" class="form-control" id="pPlanPrice" name="plan_price" value="{{ old("plan_price", $server->plan_price) }}" placeholder="e.g. $10.00/mo, ₹499/mo, Free">
                            <p class="small text-muted no-margin">Plan pricing displayed on the server dashboard (shows Free / Included if empty).</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
<!-- <<< ARIX AUTO SUSPENSION END <<< -->

CARD;
    if (strpos($c, "admin.servers.view.build") !== false) {
        $c = preg_replace('/(<form action="\{\{\s*route\(\x27admin\.servers\.view\.build\x27,\s*\$server->id\)\s*\}\}" method="POST">\s*)/', "$1" . $card, $c, 1);
        file_put_contents($buildBladeFile, $c);
    }
}

// Patch 3: resources/views/admin/servers/view/details.blade.php (Details Page - already created servers)
$detailsBladeFile = "resources/views/admin/servers/view/details.blade.php";
if (file_exists($detailsBladeFile)) {
    $c = file_get_contents($detailsBladeFile);
    $c = preg_replace("/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s", "", $c);
    $field = <<<'FIELD'
<!-- >>> ARIX AUTO SUSPENSION START >>> -->
                    <div class="form-group">
                        <label for="pExpireAt" class="control-label">Expiration Date (Auto Suspension)</label>
                        <input type="datetime-local" name="expire_at" id="pExpireAt" value="{{ old("expire_at", $server->expire_at ? $server->expire_at->format("Y-m-d\TH:i") : "") }}" class="form-control" />
                        <p class="text-muted small">The date when this server will be automatically suspended. Leave empty or clear to disable auto-suspension.</p>
                    </div>
                    <div class="form-group">
                        <label for="pPlanName" class="control-label">Plan Name</label>
                        <input type="text" name="plan_name" id="pPlanName" value="{{ old("plan_name", $server->plan_name) }}" class="form-control" placeholder="e.g. Starter 4GB, Premium Gold" />
                        <p class="text-muted small">Plan identifier displayed on the server dashboard (auto-detects from specs if empty).</p>
                    </div>
                    <div class="form-group">
                        <label for="pPlanPrice" class="control-label">Plan Price</label>
                        <input type="text" name="plan_price" id="pPlanPrice" value="{{ old("plan_price", $server->plan_price) }}" class="form-control" placeholder="e.g. $10.00/mo, ₹499/mo, Free" />
                        <p class="text-muted small">Plan pricing displayed on the server dashboard (shows Free / Included if empty).</p>
                    </div>
<!-- <<< ARIX AUTO SUSPENSION END <<< -->

FIELD;
    if (strpos($c, 'name="description"') !== false) {
        $c = preg_replace('/(<\/div>\s*<\/div>\s*<div class="box-footer">)/', $field . '$1', $c, 1);
        file_put_contents($detailsBladeFile, $c);
    }
}

// Patch 4: app/Http/Controllers/Admin/Servers/CreateServerController.php
$createCtrlFile = "app/Http/Controllers/Admin/Servers/CreateServerController.php";
if (file_exists($createCtrlFile)) {
    $c = file_get_contents($createCtrlFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        if ($request->filled("expire_at")) {
            try {
                $server->expire_at = \Carbon\Carbon::parse($request->input("expire_at"));
            } catch (\Throwable $e) {
                \Log::warning("Could not set expire_at for new server: " . $e->getMessage());
            }
        }
        $server->plan_name = $request->input("plan_name") ?: null;
        $server->plan_price = $request->input("plan_price") ?: null;
        $server->save();
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (preg_match('/(\$server\s*=\s*\$this->creationService->handle\([\s\S]*?\);\s*)/', $c, $m)) {
        $c = str_replace($m[1], $m[1] . $patch, $c);
        file_put_contents($createCtrlFile, $c);
    }
}

// Patch 5: app/Http/Controllers/Admin/ServersController.php (Server Details update)
$serversCtrlFile = "app/Http/Controllers/Admin/ServersController.php";
if (file_exists($serversCtrlFile)) {
    $c = file_get_contents($serversCtrlFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        if ($request->has("expire_at")) {
            try {
                $newExpire = $request->filled("expire_at") ? \Carbon\Carbon::parse($request->input("expire_at")) : null;
                $server->expire_at = $newExpire;
                if (is_null($newExpire) || ($server->expiration_warning_sent_at && $newExpire->isAfter(\Carbon\Carbon::now()->addDays(3)))) {
                    $server->expiration_warning_sent_at = null;
                }
            } catch (\Throwable $e) {
                \Log::warning("Could not update expire_at for server " . $server->id . ": " . $e->getMessage());
            }
        }
        if ($request->has("plan_name")) {
            $server->plan_name = $request->input("plan_name") ?: null;
        }
        if ($request->has("plan_price")) {
            $server->plan_price = $request->input("plan_price") ?: null;
        }
        $server->save();
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (preg_match('/(\$this->detailsModificationService->handle\([\s\S]*?\);\s*)/', $c, $m)) {
        $c = str_replace($m[1], $m[1] . $patch, $c);
        file_put_contents($serversCtrlFile, $c);
    }
}

// Patch 5b: app/Http/Controllers/Admin/Servers/ServerBuildController.php (Server Build update)
$buildCtrlFile = "app/Http/Controllers/Admin/Servers/ServerBuildController.php";
if (file_exists($buildCtrlFile)) {
    $c = file_get_contents($buildCtrlFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        if ($request->has("expire_at")) {
            try {
                $newExpire = $request->filled("expire_at") ? \Carbon\Carbon::parse($request->input("expire_at")) : null;
                $server->expire_at = $newExpire;
                if (is_null($newExpire) || ($server->expiration_warning_sent_at && $newExpire->isAfter(\Carbon\Carbon::now()->addDays(3)))) {
                    $server->expiration_warning_sent_at = null;
                }
            } catch (\Throwable $e) {
                \Log::warning("Could not update expire_at for server " . $server->id . ": " . $e->getMessage());
            }
        }
        if ($request->has("plan_name")) {
            $server->plan_name = $request->input("plan_name") ?: null;
        }
        if ($request->has("plan_price")) {
            $server->plan_price = $request->input("plan_price") ?: null;
        }
        $server->save();
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (preg_match('/(\$this->buildModificationService->handle\([\s\S]*?\);\s*)/', $c, $m)) {
        $c = str_replace($m[1], $m[1] . $patch, $c);
        file_put_contents($buildCtrlFile, $c);
    } elseif (strpos($c, "alerts.build_updated") !== false) {
        $c = preg_replace('/(\$this->alert->success\(trans\(\x27admin\/server\.alerts\.build_updated\x27\)\)->flash\(\);\s*)/', $patch . "        $1", $c, 1);
        file_put_contents($buildCtrlFile, $c);
    }
}

// Patch 6: app/Transformers/Api/Client/ServerTransformer.php (Expose attributes to ServerContext)
$transformerFile = "app/Transformers/Api/Client/ServerTransformer.php";
if (file_exists($transformerFile)) {
    $c = file_get_contents($transformerFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION CHECK START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION CHECK END\s*<<<\s*\*\/\s*/s", "", $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
            'expire_at' => !empty($server->expire_at) ? (\Carbon\Carbon::parse($server->expire_at)->toIso8601String()) : null,
            'plan_name' => $server->plan_name ?? null,
            'plan_price' => $server->plan_price ?? null,
            /* <<< ARIX AUTO SUSPENSION END <<< */
PATCH;
    if (strpos($c, "'egg_features'") !== false) {
        $c = preg_replace('/(\x27egg_features\x27[^\n]+,\s*)/', "$1" . $patch . "\n", $c, 1);
    } elseif (strpos($c, "'is_suspended'") !== false) {
        $c = preg_replace('/(\x27is_suspended\x27[^\n]+,\s*)/', "$1" . $patch . "\n", $c, 1);
    } elseif (strpos($c, "'uuid'") !== false) {
        $c = preg_replace('/(\x27uuid\x27[^\n]+,\s*)/', "$1" . $patch . "\n", $c, 1);
    }
    file_put_contents($transformerFile, $c);
}

// Patch 7: routes/api-client.php (Register /subscription endpoints for Arix theme widgets & ServerExpiryCard)
$routesApiFile = "routes/api-client.php";
if (file_exists($routesApiFile)) {
    $c = file_get_contents($routesApiFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
Route::group(['prefix' => '/servers/{server}'], function () {
    Route::get('/subscription', [\Pterodactyl\Http\Controllers\Api\Client\Servers\OptionsController::class, 'subscription']);
    Route::post('/subscription', [\Pterodactyl\Http\Controllers\Api\Client\Servers\OptionsController::class, 'updateSubscription']);
});
/* <<< ARIX AUTO SUSPENSION END <<< */
PATCH;
    $c = rtrim($c) . "\n\n" . $patch . "\n";
    file_put_contents($routesApiFile, $c);
}

// Patch 8: app/Console/Kernel.php
$kernelFile = "app/Console/Kernel.php";
if (file_exists($kernelFile)) {
    $c = file_get_contents($kernelFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
    $patch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
        $schedule->command("ptero:auto-suspend")->everyMinute()->withoutOverlapping();
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (strpos($c, "protected function schedule(Schedule $schedule): void") !== false) {
        $c = preg_replace('/(protected function schedule\(Schedule \$schedule\): void\s*\{)/', "$1\n        " . $patch, $c, 1);
        file_put_contents($kernelFile, $c);
    }
}

// Patch 9: app/Models/Server.php
$modelFile = "app/Models/Server.php";
if (file_exists($modelFile)) {
    $c = file_get_contents($modelFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);
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

// Patch 10: resources/scripts/api/server/getServer.ts (Map expire_at and plan attributes directly into ServerContext)
$getServerFile = "resources/scripts/api/server/getServer.ts";
if (file_exists($getServerFile)) {
    $c = file_get_contents($getServerFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);

    $interfacePatch = <<<'PATCH'
/* >>> ARIX AUTO SUSPENSION START >>> */
    expire_at?: string | null;
    plan_name?: string | null;
    plan_price?: string | null;
    /* <<< ARIX AUTO SUSPENSION END <<< */
PATCH;

    $mappingPatch = <<<'MAPPING'
/* >>> ARIX AUTO SUSPENSION START >>> */
    expire_at: (data as any).expire_at || null,
    plan_name: (data as any).plan_name || null,
    plan_price: (data as any).plan_price || null,
    /* <<< ARIX AUTO SUSPENSION END <<< */
MAPPING;

    if (strpos($c, 'isSuspended: boolean;') !== false) {
        $c = preg_replace('/(isSuspended:\s*boolean;\s*)/', "$1    " . $interfacePatch . "\n", $c, 1);
    }
    if (strpos($c, 'isSuspended: data.is_suspended,') !== false) {
        $c = preg_replace('/(isSuspended:\s*data\.is_suspended,\s*)/', "$1    " . $mappingPatch . "\n", $c, 1);
    }
    file_put_contents($getServerFile, $c);
}

// Patch 11: resources/scripts/api/getServers.ts (Map expire_at in dashboard server list API)
$getServersFile = "resources/scripts/api/getServers.ts";
if (file_exists($getServersFile)) {
    $c = file_get_contents($getServersFile);
    $c = preg_replace("/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s", "", $c);

    $mappingPatch = <<<'MAPPING'
/* >>> ARIX AUTO SUSPENSION START >>> */
    expire_at: (data as any)?.expire_at || (data as any)?.attributes?.expire_at || null,
    plan_name: (data as any)?.plan_name || (data as any)?.attributes?.plan_name || null,
    plan_price: (data as any)?.plan_price || (data as any)?.attributes?.plan_price || null,
    /* <<< ARIX AUTO SUSPENSION END <<< */
MAPPING;

    if (strpos($c, 'isSuspended') !== false && preg_match('/(isSuspended:[^\n]+,\s*)/', $c)) {
        $c = preg_replace('/(isSuspended:[^\n]+,\s*)/', "$1    " . $mappingPatch . "\n", $c, 1);
    } elseif (strpos($c, 'status:') !== false && preg_match('/(status:[^\n]+,\s*)/', $c)) {
        $c = preg_replace('/(status:[^\n]+,\s*)/', "$1    " . $mappingPatch . "\n", $c, 1);
    } elseif (strpos($c, 'uuid:') !== false && preg_match('/(uuid:[^\n]+,\s*)/', $c)) {
        $c = preg_replace('/(uuid:[^\n]+,\s*)/', "$1    " . $mappingPatch . "\n", $c, 1);
    } elseif (strpos($c, 'name:') !== false && preg_match('/(name:[^\n]+,\s*)/', $c)) {
        $c = preg_replace('/(name:[^\n]+,\s*)/', "$1    " . $mappingPatch . "\n", $c, 1);
    }
    file_put_contents($getServersFile, $c);
}

