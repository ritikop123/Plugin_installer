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

// Patch 5: app/Http/Controllers/Admin/ServersController.php (Server Details & Build update)
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

        // Re-enforce suspension if server is still expired (prevent save from clearing status)
        if (!empty($server->expire_at) && \Carbon\Carbon::parse($server->expire_at)->isPast() && $server->status !== \Pterodactyl\Models\Server::STATUS_SUSPENDED) {
            try {
                $server->status = \Pterodactyl\Models\Server::STATUS_SUSPENDED;
                $server->save();
            } catch (\Throwable $e) {}
        }
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (preg_match('/(\$this->detailsModificationService->handle\([\s\S]*?\);\s*)/', $c, $m)) {
        $c = str_replace($m[1], $m[1] . $patch, $c);
    }
    // Also patch updateBuild if it exists within ServersController.php
    if (preg_match('/(\$this->buildModificationService->handle\([\s\S]*?\);\s*)/', $c, $m)) {
        $c = str_replace($m[1], $m[1] . $patch, $c);
    } elseif (strpos($c, "alerts.build_updated") !== false) {
        $c = preg_replace('/(\$this->alert->success\(trans\(\x27admin\/server\.alerts\.build_updated\x27\)\)->flash\(\);\s*)/', $patch . "        $1", $c, 1);
    }
    file_put_contents($serversCtrlFile, $c);
}

// Patch 5b: ServerBuildController.php (Check both app/Http/Controllers/Admin/Servers and app/Http/Controllers/Admin/Server)
$buildFiles = [
    "app/Http/Controllers/Admin/Servers/ServerBuildController.php",
    "app/Http/Controllers/Admin/Server/ServerBuildController.php",
    "app/Http/Controllers/Admin/Servers/BuildController.php",
];

foreach ($buildFiles as $buildCtrlFile) {
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

        // Re-enforce suspension if server is still expired (prevent save from clearing status)
        if (!empty($server->expire_at) && \Carbon\Carbon::parse($server->expire_at)->isPast() && $server->status !== \Pterodactyl\Models\Server::STATUS_SUSPENDED) {
            try {
                $server->status = \Pterodactyl\Models\Server::STATUS_SUSPENDED;
                $server->save();
            } catch (\Throwable $e) {}
        }
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
        if (preg_match('/(\$this->buildModificationService->handle\([\s\S]*?\);\s*)/', $c, $m)) {
            $c = str_replace($m[1], $m[1] . $patch, $c);
            file_put_contents($buildCtrlFile, $c);
        } elseif (strpos($c, "alerts.build_updated") !== false) {
            $c = preg_replace('/(\$this->alert->success\(trans\(\x27admin\/server\.alerts\.build_updated\x27\)\)->flash\(\);\s*)/', $patch . "        $1", $c, 1);
            file_put_contents($buildCtrlFile, $c);
        } elseif (preg_match('/(\$this->alert->success\([^\n]+\)->flash\(\);\s*)/', $c, $m)) {
            $c = str_replace($m[1], $patch . "        " . $m[1], $c);
            file_put_contents($buildCtrlFile, $c);
        }
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
        $schedule->command('ptero:auto-suspend')->everyMinute()->withoutOverlapping();
        /* <<< ARIX AUTO SUSPENSION END <<< */

PATCH;
    if (preg_match('/(protected\s+function\s+schedule\s*\(\s*Schedule\s+\$schedule[^{]*\{)/', $c, $m)) {
        $c = str_replace($m[1], $m[1] . "\n        " . $patch, $c);
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

// Patch 12: resources/views/admin/index.blade.php (Admin Overview Sales & Revenue Analytics Card)
$adminIndexBlade = "resources/views/admin/index.blade.php";
if (file_exists($adminIndexBlade)) {
    $c = file_get_contents($adminIndexBlade);
    $c = preg_replace("/<!--\s*>>>\s*ARIX ADMIN SALES ANALYTICS START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX ADMIN SALES ANALYTICS END\s*<<<\s*-->\s*/s", "", $c);

    $analyticsCard = <<<'CARD'
<!-- >>> ARIX ADMIN SALES ANALYTICS START >>> -->
@php
    try {
        $allServers = \Pterodactyl\Models\Server::query()->get();
        $activeServers = $allServers->filter(function ($s) {
            return ($s->status ?? '') !== 'suspended';
        });
        $suspendedServers = $allServers->filter(function ($s) {
            return ($s->status ?? '') === 'suspended';
        });

        $activeCount = $activeServers->count();
        $suspendedCount = $suspendedServers->count();
        $totalServersCount = $allServers->count();

        // Helper function to extract price and currency
        $extractPrice = function ($rawPrice) {
            if (empty($rawPrice)) {
                return ['amount' => 0.0, 'currency' => ''];
            }
            $str = trim((string)$rawPrice);
            $currency = '';
            if (preg_match('/(₹|Rs\.?|INR)/i', $str)) {
                $currency = '₹';
            } elseif (str_contains($str, '€')) {
                $currency = '€';
            } elseif (str_contains($str, '£')) {
                $currency = '£';
            } elseif (str_contains($str, '$')) {
                $currency = '$';
            }

            // Extract numeric amount
            $cleanNum = preg_replace('/[^0-9\.]/', '', str_replace(',', '', $str));
            $amount = (float) $cleanNum;
            return ['amount' => $amount, 'currency' => $currency];
        };

        // Helper function to detect free plans
        $isFreePlan = function ($s) use ($extractPrice) {
            $rawPrice = trim(strtolower((string)($s->plan_price ?: '')));
            if (empty($rawPrice) || $rawPrice === 'free' || $rawPrice === '₹0' || $rawPrice === '$0' || $rawPrice === '0' || $rawPrice === '0.00' || $rawPrice === '0 inr' || $rawPrice === '0inr') {
                return true;
            }
            $p = $extractPrice($s->plan_price);
            return ($p['amount'] <= 0);
        };

        // Paid active servers only (strictly exclude free plans)
        $paidServers = $activeServers->filter(function ($s) use ($isFreePlan) {
            return !$isFreePlan($s);
        });
        $paidServersCount = $paidServers->count();
        $freeServersCount = $activeCount - $paidServersCount;

        // Determine dominant currency from paid servers
        $currCounts = ['₹' => 0, '$' => 0, '€' => 0, '£' => 0];
        foreach ($paidServers as $s) {
            $p = $extractPrice($s->plan_price);
            if (!empty($p['currency']) && isset($currCounts[$p['currency']])) {
                $currCounts[$p['currency']]++;
            }
        }
        arsort($currCounts);
        $primaryCurr = key($currCounts) ?: '$';
        if ($currCounts[$primaryCurr] === 0) {
            $primaryCurr = '$';
        }

        // 1. Total Ongoing Sells (Active Paid Servers Only)
        $totalOngoingSales = 0.0;
        foreach ($paidServers as $s) {
            $totalOngoingSales += $extractPrice($s->plan_price)['amount'];
        }

        // 2. Last Week Sells (Past 7 Days, Active Paid)
        $now = \Carbon\Carbon::now();
        $sevenDaysAgo = $now->copy()->subDays(7);
        $lastWeekServers = $paidServers->filter(function ($s) use ($sevenDaysAgo) {
            return $s->created_at && \Carbon\Carbon::parse($s->created_at)->gte($sevenDaysAgo);
        });
        $lastWeekSales = 0.0;
        foreach ($lastWeekServers as $s) {
            $lastWeekSales += $extractPrice($s->plan_price)['amount'];
        }
        $lastWeekCount = $lastWeekServers->count();

        // 3. Last Month Sells (Past 30 Days, Active Paid)
        $thirtyDaysAgo = $now->copy()->subDays(30);
        $lastMonthServers = $paidServers->filter(function ($s) use ($thirtyDaysAgo) {
            return $s->created_at && \Carbon\Carbon::parse($s->created_at)->gte($thirtyDaysAgo);
        });
        $lastMonthSales = 0.0;
        foreach ($lastMonthServers as $s) {
            $lastMonthSales += $extractPrice($s->plan_price)['amount'];
        }
        $lastMonthCount = $lastMonthServers->count();

        // 4. Best Selling Plans (Top 3 Ranking - EXCLUDES FREE PLANS)
        $plansMap = [];
        foreach ($paidServers as $s) {
            $rawPlan = trim((string)($s->plan_name ?: ''));
            if (empty($rawPlan)) {
                $rawPlan = $s->memory ? (round($s->memory / 1024) . 'GB Plan') : 'Standard Plan';
            }

            // Exclude if plan name is Free/Promo and amount is 0
            $pAmount = $extractPrice($s->plan_price)['amount'];
            if ($pAmount <= 0) {
                continue;
            }

            if (!isset($plansMap[$rawPlan])) {
                $plansMap[$rawPlan] = [
                    'name' => $rawPlan,
                    'count' => 0,
                    'total_sales' => 0.0,
                    'sample_price' => $s->plan_price,
                ];
            }
            $plansMap[$rawPlan]['count']++;
            $plansMap[$rawPlan]['total_sales'] += $pAmount;
            if (!empty($s->plan_price)) {
                $plansMap[$rawPlan]['sample_price'] = $s->plan_price;
            }
        }

        uasort($plansMap, function ($a, $b) {
            if ($a['count'] === $b['count']) {
                return $b['total_sales'] <=> $a['total_sales'];
            }
            return $b['count'] <=> $a['count'];
        });

        $top3Plans = array_values(array_slice($plansMap, 0, 3));
        $allPlansList = array_values($plansMap);
    } catch (\Throwable $e) {
        $totalOngoingSales = 0;
        $lastWeekSales = 0;
        $lastMonthSales = 0;
        $activeCount = 0;
        $paidServersCount = 0;
        $freeServersCount = 0;
        $suspendedCount = 0;
        $totalServersCount = 0;
        $lastWeekCount = 0;
        $lastMonthCount = 0;
        $primaryCurr = '$';
        $top3Plans = [];
        $allPlansList = [];
    }
@endphp

<div class="row" style="margin-top: 25px;">
    <div class="col-xs-12">
        <div class="box box-primary" style="background: #111827; border: 1px solid #1f2937; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); overflow: hidden;">
            <!-- Header -->
            <div class="box-header" style="background: #1f2937; padding: 16px 20px; border-bottom: 1px solid #374151; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); display: flex; align-items: center; justify-content: center; color: #10b981; font-size: 18px;">
                        <i class="fa fa-line-chart"></i>
                    </div>
                    <div>
                        <h3 class="box-title" style="color: #f3f4f6; font-size: 17px; font-weight: 700; margin: 0; line-height: 1.2;">Sales & Revenue Analytics</h3>
                        <p style="color: #9ca3af; font-size: 12px; margin: 3px 0 0 0;">Live revenue tracking from active servers (automatically omits suspended servers)</p>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 20px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.3); color: #34d399; font-size: 12px; font-weight: 600;">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
                        Live Ongoing Servers
                    </span>
                    <a href="{{ route('admin.index') }}" class="btn btn-xs" style="background: #374151; color: #d1d5db; border: 1px solid #4b5563; border-radius: 6px; padding: 5px 12px; font-size: 12px;" title="Refresh Sales Analytics">
                        <i class="fa fa-refresh"></i> Refresh
                    </a>
                </div>
            </div>

            <div class="box-body" style="padding: 24px 20px; background: #111827;">
                <!-- 4 KPI Stat Boxes -->
                <div class="row">
                    <!-- Total Ongoing Sales -->
                    <div class="col-xs-12 col-sm-6 col-md-3" style="margin-bottom: 16px;">
                        <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.05) 100%); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 18px 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <span style="color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total Ongoing Sells</span>
                                    <h2 style="color: #10b981; font-size: 26px; font-weight: 800; margin: 6px 0 3px 0; letter-spacing: -0.5px;">
                                        {{ $primaryCurr }}{{ number_format($totalOngoingSales, 2) }}
                                    </h2>
                                    <span style="color: #6ee7b7; font-size: 11px; font-weight: 600;">
                                        <i class="fa fa-check-circle"></i> {{ $paidServersCount }} paid servers counted
                                    </span>
                                </div>
                                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.3); display: flex; align-items: center; justify-content: center; color: #34d399; font-size: 17px;">
                                    <i class="fa fa-money"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Last Week Sells (7 Days) -->
                    <div class="col-xs-12 col-sm-6 col-md-3" style="margin-bottom: 16px;">
                        <div style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.05) 100%); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 12px; padding: 18px 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <span style="color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Last Week Sells</span>
                                    <h2 style="color: #60a5fa; font-size: 26px; font-weight: 800; margin: 6px 0 3px 0; letter-spacing: -0.5px;">
                                        {{ $primaryCurr }}{{ number_format($lastWeekSales, 2) }}
                                    </h2>
                                    <span style="color: #93c5fd; font-size: 11px; font-weight: 600;">
                                        <i class="fa fa-calendar-check-o"></i> {{ $lastWeekCount }} paid servers added (last 7d)
                                    </span>
                                </div>
                                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.3); display: flex; align-items: center; justify-content: center; color: #60a5fa; font-size: 17px;">
                                    <i class="fa fa-calendar"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Last Month Sells (30 Days) -->
                    <div class="col-xs-12 col-sm-6 col-md-3" style="margin-bottom: 16px;">
                        <div style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(147, 51, 234, 0.05) 100%); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 12px; padding: 18px 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <span style="color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Last Month Sells</span>
                                    <h2 style="color: #c084fc; font-size: 26px; font-weight: 800; margin: 6px 0 3px 0; letter-spacing: -0.5px;">
                                        {{ $primaryCurr }}{{ number_format($lastMonthSales, 2) }}
                                    </h2>
                                    <span style="color: #d8b4fe; font-size: 11px; font-weight: 600;">
                                        <i class="fa fa-history"></i> {{ $lastMonthCount }} paid servers added (last 30d)
                                    </span>
                                </div>
                                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(168, 85, 247, 0.2); border: 1px solid rgba(168, 85, 247, 0.3); display: flex; align-items: center; justify-content: center; color: #c084fc; font-size: 17px;">
                                    <i class="fa fa-area-chart"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Server Status Breakdown -->
                    <div class="col-xs-12 col-sm-6 col-md-3" style="margin-bottom: 16px;">
                        <div style="background: linear-gradient(135deg, rgba(234, 88, 12, 0.12) 0%, rgba(194, 65, 12, 0.05) 100%); border: 1px solid rgba(234, 88, 12, 0.35); border-radius: 12px; padding: 18px 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <span style="color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Ongoing vs Suspended</span>
                                    <div style="display: flex; align-items: baseline; gap: 8px; margin: 6px 0 3px 0;">
                                        <span style="color: #10b981; font-size: 22px; font-weight: 800;">{{ $activeCount }} Active</span>
                                        <span style="color: #6b7280; font-size: 14px;">/</span>
                                        <span style="color: #ef4444; font-size: 16px; font-weight: 700;">{{ $suspendedCount }} Susp</span>
                                    </div>
                                    <span style="color: #fdba74; font-size: 11px; font-weight: 600;">
                                        <i class="fa fa-server"></i> {{ $paidServersCount }} Paid • {{ $freeServersCount }} Free Servers
                                    </span>
                                </div>
                                <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(234, 88, 12, 0.2); border: 1px solid rgba(234, 88, 12, 0.3); display: flex; align-items: center; justify-content: center; color: #fb923c; font-size: 17px;">
                                    <i class="fa fa-server"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Best Selling Plans Podium (3 - 2 - 1) -->
                <div style="margin-top: 10px; padding-top: 20px; border-top: 1px solid #1f2937;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 30px; height: 30px; border-radius: 8px; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); display: flex; align-items: center; justify-content: center; color: #fbbf24; font-size: 14px;">
                                <i class="fa fa-trophy"></i>
                            </div>
                            <div>
                                <h4 style="color: #f3f4f6; font-size: 16px; font-weight: 700; margin: 0;">Best Selling Plans (Top 1 • 2 • 3)</h4>
                                <span style="color: #9ca3af; font-size: 12px;">Ranked dynamically by paid active servers adopting each plan (free plans excluded)</span>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <!-- #1 Best Seller (Gold) -->
                        <div class="col-xs-12 col-md-4" style="margin-bottom: 15px;">
                            <div style="background: linear-gradient(145deg, rgba(245, 158, 11, 0.12) 0%, rgba(17, 24, 39, 0.95) 100%); border: 1px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 20px; position: relative; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.08);">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
                                        🥇 #1 BEST SELLER
                                    </span>
                                    <span style="color: #fbbf24; font-size: 18px;"><i class="fa fa-trophy"></i></span>
                                </div>
                                @if(isset($top3Plans[0]))
                                    <h3 style="color: #ffffff; font-size: 19px; font-weight: 800; margin: 0 0 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        {{ $top3Plans[0]['name'] }}
                                    </h3>
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                        <span style="background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); color: #fde68a; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700;">
                                            {{ $top3Plans[0]['sample_price'] }}
                                        </span>
                                        <span style="color: #9ca3af; font-size: 12px;">per server</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #d1d5db; margin-bottom: 8px;">
                                        <span>Active Sells:</span>
                                        <strong style="color: #fbbf24; font-size: 15px;">{{ $top3Plans[0]['count'] }} servers</strong>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
                                        <span>Total Ongoing:</span>
                                        <strong style="color: #10b981; font-size: 15px;">{{ $primaryCurr }}{{ number_format($top3Plans[0]['total_sales'], 2) }}</strong>
                                    </div>
                                    @php $pct1 = $paidServersCount > 0 ? round(($top3Plans[0]['count'] / $paidServersCount) * 100) : 0; @endphp
                                    <div style="background: #1f2937; border-radius: 6px; height: 6px; overflow: hidden;">
                                        <div style="background: linear-gradient(90deg, #f59e0b, #fbbf24); width: {{ $pct1 }}%; height: 100%;"></div>
                                    </div>
                                    <span style="color: #9ca3af; font-size: 11px; margin-top: 5px; display: block;">{{ $pct1 }}% of all paid ongoing servers</span>
                                @else
                                    <p style="color: #6b7280; font-size: 13px; margin: 20px 0;">No paid servers assigned yet.</p>
                                @endif
                            </div>
                        </div>

                        <!-- #2 Best Seller (Silver) -->
                        <div class="col-xs-12 col-md-4" style="margin-bottom: 15px;">
                            <div style="background: linear-gradient(145deg, rgba(148, 163, 184, 0.1) 0%, rgba(17, 24, 39, 0.95) 100%); border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 12px; padding: 20px; position: relative;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; background: linear-gradient(135deg, #94a3b8, #64748b); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
                                        🥈 #2 BEST SELLER
                                    </span>
                                    <span style="color: #cbd5e1; font-size: 18px;"><i class="fa fa-star"></i></span>
                                </div>
                                @if(isset($top3Plans[1]))
                                    <h3 style="color: #ffffff; font-size: 19px; font-weight: 800; margin: 0 0 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        {{ $top3Plans[1]['name'] }}
                                    </h3>
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                        <span style="background: rgba(148, 163, 184, 0.2); border: 1px solid rgba(148, 163, 184, 0.4); color: #e2e8f0; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700;">
                                            {{ $top3Plans[1]['sample_price'] }}
                                        </span>
                                        <span style="color: #9ca3af; font-size: 12px;">per server</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #d1d5db; margin-bottom: 8px;">
                                        <span>Active Sells:</span>
                                        <strong style="color: #e2e8f0; font-size: 15px;">{{ $top3Plans[1]['count'] }} servers</strong>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
                                        <span>Total Ongoing:</span>
                                        <strong style="color: #10b981; font-size: 15px;">{{ $primaryCurr }}{{ number_format($top3Plans[1]['total_sales'], 2) }}</strong>
                                    </div>
                                    @php $pct2 = $paidServersCount > 0 ? round(($top3Plans[1]['count'] / $paidServersCount) * 100) : 0; @endphp
                                    <div style="background: #1f2937; border-radius: 6px; height: 6px; overflow: hidden;">
                                        <div style="background: linear-gradient(90deg, #94a3b8, #cbd5e1); width: {{ $pct2 }}%; height: 100%;"></div>
                                    </div>
                                    <span style="color: #9ca3af; font-size: 11px; margin-top: 5px; display: block;">{{ $pct2 }}% of all paid ongoing servers</span>
                                @else
                                    <p style="color: #6b7280; font-size: 13px; margin: 20px 0;">No 2nd paid plan recorded yet.</p>
                                @endif
                            </div>
                        </div>

                        <!-- #3 Best Seller (Bronze) -->
                        <div class="col-xs-12 col-md-4" style="margin-bottom: 15px;">
                            <div style="background: linear-gradient(145deg, rgba(217, 119, 6, 0.1) 0%, rgba(17, 24, 39, 0.95) 100%); border: 1px solid rgba(217, 119, 6, 0.35); border-radius: 12px; padding: 20px; position: relative;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; background: linear-gradient(135deg, #d97706, #b45309); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.5px;">
                                        🥉 #3 BEST SELLER
                                    </span>
                                    <span style="color: #f59e0b; font-size: 18px;"><i class="fa fa-certificate"></i></span>
                                </div>
                                @if(isset($top3Plans[2]))
                                    <h3 style="color: #ffffff; font-size: 19px; font-weight: 800; margin: 0 0 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        {{ $top3Plans[2]['name'] }}
                                    </h3>
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                                        <span style="background: rgba(217, 119, 6, 0.2); border: 1px solid rgba(217, 119, 6, 0.4); color: #fed7aa; padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700;">
                                            {{ $top3Plans[2]['sample_price'] }}
                                        </span>
                                        <span style="color: #9ca3af; font-size: 12px;">per server</span>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #d1d5db; margin-bottom: 8px;">
                                        <span>Active Sells:</span>
                                        <strong style="color: #fed7aa; font-size: 15px;">{{ $top3Plans[2]['count'] }} servers</strong>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #d1d5db; margin-bottom: 12px;">
                                        <span>Total Ongoing:</span>
                                        <strong style="color: #10b981; font-size: 15px;">{{ $primaryCurr }}{{ number_format($top3Plans[2]['total_sales'], 2) }}</strong>
                                    </div>
                                    @php $pct3 = $paidServersCount > 0 ? round(($top3Plans[2]['count'] / $paidServersCount) * 100) : 0; @endphp
                                    <div style="background: #1f2937; border-radius: 6px; height: 6px; overflow: hidden;">
                                        <div style="background: linear-gradient(90deg, #d97706, #f59e0b); width: {{ $pct3 }}%; height: 100%;"></div>
                                    </div>
                                    <span style="color: #9ca3af; font-size: 11px; margin-top: 5px; display: block;">{{ $pct3 }}% of all paid ongoing servers</span>
                                @else
                                    <p style="color: #6b7280; font-size: 13px; margin: 20px 0;">No 3rd paid plan recorded yet.</p>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>

                @if(count($allPlansList) > 3)
                    <!-- Additional Plans Table -->
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #1f2937;">
                        <h5 style="color: #9ca3af; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px;">All Other Active Plans</h5>
                        <div class="table-responsive" style="border: 1px solid #1f2937; border-radius: 8px; overflow: hidden;">
                            <table class="table table-hover" style="margin-bottom: 0; background: #131b2e; color: #d1d5db; font-size: 12px;">
                                <thead>
                                    <tr style="background: #1f2937; color: #9ca3af;">
                                        <th>Rank</th>
                                        <th>Plan Name</th>
                                        <th>Price</th>
                                        <th style="text-align: center;">Active Sells</th>
                                        <th style="text-align: right;">Total Ongoing</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @foreach(array_slice($allPlansList, 3) as $idx => $p)
                                        <tr>
                                            <td style="font-weight: 700; color: #9ca3af;">#{{ $idx + 4 }}</td>
                                            <td style="font-weight: 600; color: #f3f4f6;">{{ $p['name'] }}</td>
                                            <td><span class="label" style="background: #374151; color: #e5e7eb;">{{ $p['sample_price'] }}</span></td>
                                            <td style="text-align: center; font-weight: 700; color: #60a5fa;">{{ $p['count'] }} servers</td>
                                            <td style="text-align: right; font-weight: 700; color: #10b981;">{{ $primaryCurr }}{{ number_format($p['total_sales'], 2) }}</td>
                                        </tr>
                                    @endforeach
                                </tbody>
                            </table>
                        </div>
                    </div>
                @endif
            </div>
        </div>
    </div>
</div>
<!-- <<< ARIX ADMIN SALES ANALYTICS END <<< -->
CARD;

    if (preg_match('/(@(endsection|stop)\s*)$/', $c, $m)) {
        $c = preg_replace('/(@(endsection|stop)\s*)$/', $analyticsCard . "\n$1", $c, 1);
        file_put_contents($adminIndexBlade, $c);
    } elseif (($pos = strrpos($c, '@endsection')) !== false) {
        $c = substr_replace($c, "\n" . $analyticsCard . "\n@endsection", $pos, strlen('@endsection'));
        file_put_contents($adminIndexBlade, $c);
    } elseif (($pos = strrpos($c, '@stop')) !== false) {
        $c = substr_replace($c, "\n" . $analyticsCard . "\n@stop", $pos, strlen('@stop'));
        file_put_contents($adminIndexBlade, $c);
    }
}

