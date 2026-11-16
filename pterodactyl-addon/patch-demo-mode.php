<?php

// =========================================================================
//  Arix Theme Demo Account & Dummy Server Preview Patcher
// =========================================================================

echo "[*] Applying Demo Preview Mode patches...\n";

// -------------------------------------------------------------------------
// PART 1: Register DemoModeMiddleware in app/Http/Kernel.php
// -------------------------------------------------------------------------
$kernelFile = 'app/Http/Kernel.php';
if (file_exists($kernelFile)) {
    $c = file_get_contents($kernelFile);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);

    $mwLine = "\n            /* >>> ARIX DEMO MODE START >>> */\n            \\Pterodactyl\\Http\\Middleware\\DemoModeMiddleware::class,\n            /* <<< ARIX DEMO MODE END <<< */";

    // Inject into 'web' middleware group
    if (preg_match('/(\x27web\x27\s*=>\s*\[[\s\S]*?)(\r?\n\s*\],)/', $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[2][1];
        $c = substr($c, 0, $pos) . $mwLine . substr($c, $pos);
    }

    // Inject into 'client-api' middleware group
    if (preg_match('/(\x27client-api\x27\s*=>\s*\[[\s\S]*?)(\r?\n\s*\],)/', $c, $m, PREG_OFFSET_CAPTURE)) {
        $pos = $m[2][1];
        $c = substr($c, 0, $pos) . $mwLine . substr($c, $pos);
    }

    file_put_contents($kernelFile, $c);
    echo "[✓] Registered DemoModeMiddleware in {$kernelFile}\n";
}

// -------------------------------------------------------------------------
// PART 2: Add is_demo cast and Eloquent immutable guard to app/Models/User.php
// -------------------------------------------------------------------------
$userModelFile = 'app/Models/User.php';
if (file_exists($userModelFile)) {
    $c = file_get_contents($userModelFile);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);

    $castPatch = "\n        /* >>> ARIX DEMO MODE START >>> */\n        'is_demo' => 'boolean',\n        /* <<< ARIX DEMO MODE END <<< */";
    if (preg_match('/(\x27root_admin\x27\s*=>\s*\x27boolean\x27,)/', $c)) {
        $c = preg_replace('/(\x27root_admin\x27\s*=>\s*\x27boolean\x27,)/', "$1" . $castPatch, $c, 1);
    }

    $guardCode = <<<'GUARD'
        static::updating(function (\Pterodactyl\Models\User $user) {
            $isDemo = (bool) ($user->getOriginal('is_demo') ?? $user->is_demo ?? false);
            if (!$isDemo) {
                $configuredEmail = trim((string) env('DEMO_ACCOUNT_EMAIL', 'demo@gmail.com'));
                $origEmail = (string) ($user->getOriginal('email') ?? $user->email ?? '');
                $isDemo = ($configuredEmail !== '' && strcasecmp($origEmail, $configuredEmail) === 0);
            }

            if (!$isDemo || app()->runningInConsole()) {
                return;
            }

            $actor = auth()->user();
            if ($actor && !empty($actor->root_admin) && empty($actor->is_demo)) {
                return;
            }

            $protected = ['email', 'username', 'name_first', 'name_last', 'password', 'use_totp', 'totp_secret', 'root_admin', 'external_id'];
            foreach ($protected as $field) {
                if ($user->isDirty($field)) {
                    throw new \Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException(
                        'Demo account name, email, password, and security settings cannot be modified.'
                    );
                }
            }
        });
GUARD;

    if (preg_match('/(protected\s+static\s+function\s+booted\s*\(\s*\)\s*(?::\s*void)?\s*\{)/', $c)) {
        $wrappedGuard = "\n        /* >>> ARIX DEMO MODE START >>> */\n" . $guardCode . "\n        /* <<< ARIX DEMO MODE END <<< */";
        $c = preg_replace(
            '/(protected\s+static\s+function\s+booted\s*\(\s*\)\s*(?::\s*void)?\s*\{)/',
            "$1" . $wrappedGuard,
            $c,
            1
        );
    } elseif (preg_match('/(class\s+User\s+extends\s+[^{]+\{)/s', $c)) {
        $bootMethod = "\n    /* >>> ARIX DEMO MODE START >>> */\n    protected static function booted(): void\n    {\n        parent::booted();\n"
            . $guardCode
            . "\n    }\n    /* <<< ARIX DEMO MODE END <<< */";
        $c = preg_replace('/(class\s+User\s+extends\s+[^{]+\{)/s', "$1" . $bootMethod, $c, 1);
    }

    file_put_contents($userModelFile, $c);
    echo "[✓] Protected demo user attributes in {$userModelFile}\n";
}

// -------------------------------------------------------------------------
// PART 3: Add is_demo cast to app/Models/Server.php
// -------------------------------------------------------------------------
$serverModelFile = 'app/Models/Server.php';
if (file_exists($serverModelFile)) {
    $c = file_get_contents($serverModelFile);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);

    $castPatch = "\n        /* >>> ARIX DEMO MODE START >>> */\n        'is_demo' => 'boolean',\n        /* <<< ARIX DEMO MODE END <<< */";
    if (preg_match('/(\x27oom_disabled\x27\s*=>\s*\x27boolean\x27,)/', $c)) {
        $c = preg_replace('/(\x27oom_disabled\x27\s*=>\s*\x27boolean\x27,)/', "$1" . $castPatch, $c, 1);
    } elseif (preg_match('/(\x27installed_at\x27\s*=>\s*\x27datetime\x27,)/', $c)) {
        $c = preg_replace('/(\x27installed_at\x27\s*=>\s*\x27datetime\x27,)/', "$1" . $castPatch, $c, 1);
    }

    file_put_contents($serverModelFile, $c);
    echo "[✓] Added is_demo cast in {$serverModelFile}\n";
}

// -------------------------------------------------------------------------
// PART 4: Expose is_demo in AccountTransformer & ServerTransformer
// -------------------------------------------------------------------------
$accountTransformerFile = 'app/Transformers/Api/Client/AccountTransformer.php';
if (file_exists($accountTransformerFile)) {
    $c = file_get_contents($accountTransformerFile);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);
    $patch = "\n            /* >>> ARIX DEMO MODE START >>> */\n            'is_demo' => (bool) (\$model->is_demo ?? false),\n            /* <<< ARIX DEMO MODE END <<< */";
    if (strpos($c, "'email' => \$model->email,") !== false) {
        $c = str_replace("'email' => \$model->email,", "'email' => \$model->email," . $patch, $c);
        file_put_contents($accountTransformerFile, $c);
        echo "[✓] Exposed is_demo in {$accountTransformerFile}\n";
    }
}

$serverTransformerFile = 'app/Transformers/Api/Client/ServerTransformer.php';
if (file_exists($serverTransformerFile)) {
    $c = file_get_contents($serverTransformerFile);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);
    $patch = "\n            /* >>> ARIX DEMO MODE START >>> */\n            'is_demo' => (bool) (\$server->is_demo ?? false),\n            /* <<< ARIX DEMO MODE END <<< */";
    if (preg_match('/(\x27uuid\x27\s*=>[^\r\n,]+,)/', $c)) {
        $c = preg_replace('/(\x27uuid\x27\s*=>[^\r\n,]+,)/', "$1" . $patch, $c, 1);
        file_put_contents($serverTransformerFile, $c);
        echo "[✓] Exposed is_demo in {$serverTransformerFile}\n";
    }
}

// -------------------------------------------------------------------------
// PART 5: Expose is_demo in getServer.ts & getServers.ts
// -------------------------------------------------------------------------
$getServerTs = 'resources/scripts/api/server/getServer.ts';
if (file_exists($getServerTs)) {
    $c = file_get_contents($getServerTs);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);
    if (preg_match('/(\buuid\??:\s*string(?:\s*\|\s*null)?;\s*)/', $c)) {
        $c = preg_replace(
            '/(\buuid\??:\s*string(?:\s*\|\s*null)?;)/',
            "$1\n    /* >>> ARIX DEMO MODE START >>> */\n    is_demo?: boolean;\n    /* <<< ARIX DEMO MODE END <<< */",
            $c,
            1
        );
    } elseif (strpos($c, 'isSuspended: boolean;') !== false) {
        $c = preg_replace(
            '/(isSuspended:\s*boolean;)/',
            "$1\n    /* >>> ARIX DEMO MODE START >>> */\n    is_demo?: boolean;\n    /* <<< ARIX DEMO MODE END <<< */",
            $c,
            1
        );
    }
    if (preg_match('/(\buuid:\s*data\.uuid,)/', $c)) {
        $c = preg_replace(
            '/(\buuid:\s*data\.uuid,)/',
            "$1\n    /* >>> ARIX DEMO MODE START >>> */\n    is_demo: Boolean((data as any).is_demo),\n    /* <<< ARIX DEMO MODE END <<< */",
            $c,
            1
        );
    } elseif (strpos($c, 'isSuspended: data.is_suspended,') !== false) {
        $c = preg_replace(
            '/(isSuspended:\s*data\.is_suspended,)/',
            "$1\n    /* >>> ARIX DEMO MODE START >>> */\n    is_demo: Boolean((data as any).is_demo),\n    /* <<< ARIX DEMO MODE END <<< */",
            $c,
            1
        );
    }
    file_put_contents($getServerTs, $c);
    echo "[✓] Mapped is_demo in {$getServerTs}\n";
}

$getServersTs = 'resources/scripts/api/getServers.ts';
if (file_exists($getServersTs)) {
    $c = file_get_contents($getServersTs);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);
    if (strpos($c, 'rawDataToServerObject =') !== false || strpos($c, 'isSuspended:') !== false) {
        $mappingPatch = "\n    /* >>> ARIX DEMO MODE START >>> */\n    is_demo: Boolean((data as any)?.is_demo || (data as any)?.attributes?.is_demo),\n    /* <<< ARIX DEMO MODE END <<< */";
        if (preg_match('/(isSuspended:[^\r\n]+,)/', $c)) {
            $c = preg_replace('/(isSuspended:[^\r\n]+,)/', "$1" . $mappingPatch, $c, 1);
        } elseif (preg_match('/(uuid:\s*data\.uuid[^\r\n]*,)/', $c)) {
            $c = preg_replace('/(uuid:\s*data\.uuid[^\r\n]*,)/', "$1" . $mappingPatch, $c, 1);
        }
        file_put_contents($getServersTs, $c);
        echo "[✓] Mapped is_demo in {$getServersTs}\n";
    }
}

// -------------------------------------------------------------------------
// PART 6: Patch resources/scripts/plugins/Websocket.ts for demo:// offline console
// -------------------------------------------------------------------------
$websocketTs = 'resources/scripts/plugins/Websocket.ts';
if (file_exists($websocketTs)) {
    $c = file_get_contents($websocketTs);
    $c = preg_replace('/\r?\n?[ \t]*\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\//s', '', $c);

    // 1. Add isDemoSocket field
    if (preg_match('/(private\s+token(?:\s*:\s*string)?\s*=\s*[\x27\x22][\x27\x22];)/', $c)) {
        $c = preg_replace(
            '/(private\s+token(?:\s*:\s*string)?\s*=\s*[\x27\x22][\x27\x22];)/',
            "$1\n    /* >>> ARIX DEMO MODE START >>> */\n    private isDemoSocket = false;\n    /* <<< ARIX DEMO MODE END <<< */",
            $c,
            1
        );
    }

    // 2. Handle demo:// inside connect(url: string)
    $connectDemo = <<<'DEMO_CONNECT'
        /* >>> ARIX DEMO MODE START >>> */
        if (url && url.startsWith('demo://')) {
            this.isDemoSocket = true;
            window.setTimeout(() => {
                if (!this.isDemoSocket) return;
                this.emit('SOCKET_OPEN');
                this.emit('auth success');
                this.emit('status', 'offline');
                this.emit(
                    'stats',
                    JSON.stringify({
                        memory_bytes: 0,
                        memory_limit_bytes: 8589934592,
                        cpu_absolute: 0,
                        disk_bytes: 1482043392,
                        network: { rx_bytes: 0, tx_bytes: 0 },
                        state: 'offline',
                        uptime: 0,
                    })
                );
            }, 60);
            return this;
        }
        this.isDemoSocket = false;
        /* <<< ARIX DEMO MODE END <<< */
DEMO_CONNECT;
    $c = preg_replace('/(this\.url\s*=\s*url;)/', "$1\n" . $connectDemo, $c, 1);

    // 3. Guard authenticate(), open(), reconnect(), close()
    $c = preg_replace(
        '/(\n\s*(?:public\s+)?authenticate\s*\(\s*\)\s*(?::\s*[^{]+)?\{)/',
        "$1\n        /* >>> ARIX DEMO MODE START >>> */\n        if (this.isDemoSocket) return;\n        /* <<< ARIX DEMO MODE END <<< */",
        $c,
        1
    );
    $c = preg_replace(
        '/(\n\s*(?:public\s+)?close\s*\([^)]*\)\s*(?::\s*[^{]+)?\{)/',
        "$1\n        /* >>> ARIX DEMO MODE START >>> */\n        this.isDemoSocket = false;\n        /* <<< ARIX DEMO MODE END <<< */",
        $c,
        1
    );
    $c = preg_replace(
        '/(\n\s*(?:public\s+)?open\s*\(\s*\)\s*(?::\s*[^{]+)?\{)/',
        "$1\n        /* >>> ARIX DEMO MODE START >>> */\n        if (this.isDemoSocket) return;\n        /* <<< ARIX DEMO MODE END <<< */",
        $c,
        1
    );
    $c = preg_replace(
        '/(\n\s*(?:public\s+)?reconnect\s*\(\s*\)\s*(?::\s*[^{]+)?\{)/',
        "$1\n        /* >>> ARIX DEMO MODE START >>> */\n        if (this.isDemoSocket) return;\n        /* <<< ARIX DEMO MODE END <<< */",
        $c,
        1
    );

    // 4. Intercept send(event, payload)
    $sendDemo = <<<'DEMO_SEND'
        /* >>> ARIX DEMO MODE START >>> */
        if (this.isDemoSocket) {
            if (event === 'send logs') {
                const lines = [
                    '\x1b[36m[Demo Preview]\x1b[0m Connected to read-only demo server console.',
                    '\x1b[32m[Demo Preview]\x1b[0m Paper 1.21.1 (Build #132) | Address: play.demo-server.net:25565',
                    '\x1b[33m[Demo Preview]\x1b[0m Status: Offline — This dummy server cannot be started in preview mode.',
                    '\x1b[90m[Demo Preview]\x1b[0m Explore Files, Plugins, Mods, Modpacks, Software, Options, Players, Worlds, Backups & AI Assistant!',
                ];
                lines.forEach((line, idx) => {
                    window.setTimeout(() => {
                        if (this.isDemoSocket) this.emit('console output', line);
                    }, 30 * (idx + 1));
                });
            } else if (event === 'send stats') {
                this.emit(
                    'stats',
                    JSON.stringify({
                        memory_bytes: 0,
                        memory_limit_bytes: 8589934592,
                        cpu_absolute: 0,
                        disk_bytes: 1482043392,
                        network: { rx_bytes: 0, tx_bytes: 0 },
                        state: 'offline',
                        uptime: 0,
                    })
                );
            } else if (event === 'set state') {
                this.emit('status', 'offline');
                this.emit('console output', '\x1b[31m[Demo Preview]\x1b[0m Power actions disabled: dummy server cannot be started.');
                window.dispatchEvent(
                    new CustomEvent('arix:demo-blocked', {
                        detail: { message: 'This demo server cannot be started or controlled in preview mode.' },
                    })
                );
            } else if (event === 'send command') {
                this.emit('console output', '\x1b[33m[Demo Preview]\x1b[0m Server is offline. Console commands are disabled in demo mode.');
                window.dispatchEvent(
                    new CustomEvent('arix:demo-blocked', {
                        detail: { message: 'Demo server is offline and cannot execute console commands.' },
                    })
                );
            }
            return;
        }
        /* <<< ARIX DEMO MODE END <<< */
DEMO_SEND;
    $c = preg_replace('/(\n\s*(?:public\s+)?send\s*\(\s*event[^)]*\)\s*(?::\s*[^{]+)?\{)/', "$1\n" . $sendDemo, $c, 1);

    file_put_contents($websocketTs, $c);
    echo "[✓] Patched demo:// offline simulator in {$websocketTs}\n";
}

// -------------------------------------------------------------------------
// PART 7: Mount DemoBanner in resources/scripts/components/App.tsx
// -------------------------------------------------------------------------
$appTsx = 'resources/scripts/components/App.tsx';
if (file_exists($appTsx)) {
    $c = file_get_contents($appTsx);
    $c = preg_replace('/\/\*\s*>>>\s*ARIX DEMO MODE START\s*>>>\s*\*\/[\s\S]*?\/\*\s*<<<\s*ARIX DEMO MODE END\s*<<<\s*\*\/\r?\n?/s', '', $c);
    $c = preg_replace('/\r?\n?[ \t]*\{\/\*\s*>>>\s*ARIX DEMO MODE START[\s\S]*?ARIX DEMO MODE END\s*<<<\s*\*\/\}/s', '', $c);
    $c = preg_replace('/import\s+DemoBanner\s+from\s+[^;]+;\s*/s', '', $c);
    $c = preg_replace('/<DemoBanner\s*\/>\s*/s', '', $c);

    $importStmt = "/* >>> ARIX DEMO MODE START >>> */\nimport DemoBanner from '@/components/elements/DemoBanner';\n/* <<< ARIX DEMO MODE END <<< */\n";
    $c = $importStmt . $c;

    $bannerJsx = "\n                {/* >>> ARIX DEMO MODE START >>> */}\n                <DemoBanner />\n                {/* <<< ARIX DEMO MODE END <<< */}";
    if (strpos($c, '<ProgressBar />') !== false) {
        $c = str_replace('<ProgressBar />', '<ProgressBar />' . $bannerJsx, $c);
    } elseif (strpos($c, '<ProgressBar/>') !== false) {
        $c = str_replace('<ProgressBar/>', '<ProgressBar/>' . $bannerJsx, $c);
    } elseif (strpos($c, '</StoreProvider>') !== false) {
        $c = str_replace('</StoreProvider>', $bannerJsx . "\n            </StoreProvider>", $c);
    }

    file_put_contents($appTsx, $c);
    echo "[✓] Mounted <DemoBanner /> in {$appTsx}\n";
}

// -------------------------------------------------------------------------
// PART 8: Disable Start/Power controls visually on PowerButtons components
// -------------------------------------------------------------------------
$serverDir = 'resources/scripts/components/server';
if (is_dir($serverDir)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($serverDir));
    foreach ($it as $file) {
        if (!$file->isFile() || !preg_match('/PowerButtons.*\.tsx$/i', $file->getFilename())) {
            continue;
        }
        $fp = $file->getPathname();
        $c = file_get_contents($fp);
        $orig = $c;

        // Clean prior markers
        $c = preg_replace('/\r?\n?[ \t]*\{?\/\*\s*>>>\s*ARIX DEMO MODE START[\s\S]*?ARIX DEMO MODE END\s*<<<\s*\*\/\}?/s', '', $c);
        $c = str_replace('isDemoServer || ', '', $c);

        // Inject isDemoServer hook next to status selector
        $injectedHook = false;
        if (preg_match('/(const\s+status\s*=\s*ServerContext\.useStoreState[\s\S]*?;)/', $c)) {
            $hook = "\n    /* >>> ARIX DEMO MODE START >>> */\n    const isDemoServer = ServerContext.useStoreState((state) => Boolean((state.server.data as any)?.is_demo));\n    /* <<< ARIX DEMO MODE END <<< */";
            $c = preg_replace('/(const\s+status\s*=\s*ServerContext\.useStoreState[\s\S]*?;)/', "$1" . $hook, $c, 1);
            $injectedHook = true;
            if (strpos($c, 'ServerContext') === false) {
                $c = "import { ServerContext } from '@/state/server';\n" . $c;
            }
        }

        // Guard click handler if present
        if ($injectedHook && preg_match('/(const\s+onButtonClick\s*=\s*\([^)]*\)(?::\s*void)?\s*=>\s*\{)/s', $c)) {
            $guard = "\n        /* >>> ARIX DEMO MODE START >>> */\n        if (isDemoServer) {\n            e?.preventDefault?.();\n            window.dispatchEvent(new CustomEvent('arix:demo-blocked', { detail: { message: 'This demo server cannot be started or controlled in preview mode.' } }));\n            return;\n        }\n        /* <<< ARIX DEMO MODE END <<< */";
            $c = preg_replace('/(const\s+onButtonClick\s*=\s*\([^)]*\)(?::\s*void)?\s*=>\s*\{)/s', "$1" . $guard, $c, 1);
        }

        if ($injectedHook && strpos($c, 'isDemoServer') !== false) {
            $c = str_replace("disabled={status !== 'offline'}", "disabled={isDemoServer || status !== 'offline'}", $c);
            $c = str_replace("disabled={!status}", "disabled={isDemoServer || !status}", $c);
            $c = str_replace("disabled={status === 'offline'}", "disabled={isDemoServer || status === 'offline'}", $c);
        }

        if ($c !== $orig) {
            file_put_contents($fp, $c);
            echo "[✓] Locked PowerButtons for demo servers in {$fp}\n";
        }
    }
}

// -------------------------------------------------------------------------
// PART 9: Add Demo Account Lock Notice on AccountOverviewContainer.tsx
// -------------------------------------------------------------------------
$dashDir = 'resources/scripts/components/dashboard';
if (is_dir($dashDir)) {
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dashDir));
    foreach ($it as $file) {
        if (!$file->isFile() || stripos($file->getFilename(), 'AccountOverviewContainer') === false) {
            continue;
        }
        $fp = $file->getPathname();
        $c = file_get_contents($fp);
        $orig = $c;

        $c = preg_replace('/\r?\n?[ \t]*\{?\/\*\s*>>>\s*ARIX DEMO MODE START[\s\S]*?ARIX DEMO MODE END\s*<<<\s*\*\/\}?/s', '', $c);

        $noticeJsx = <<<'NOTICE'

            {/* >>> ARIX DEMO MODE START >>> */}
            {Boolean((window as any).PterodactylUser?.is_demo) && (
                <div className={'mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200'}>
                    <strong className={'text-amber-300'}>Demo Account Protection:</strong> Account name, username, email address, password, and two-factor settings cannot be modified in preview mode.
                </div>
            )}
            {/* <<< ARIX DEMO MODE END <<< */}
NOTICE;

        if (preg_match('/(<PageContentBlock[^>]*>)/', $c)) {
            $c = preg_replace('/(<PageContentBlock[^>]*>)/', "$1" . $noticeJsx, $c, 1);
        }

        if ($c !== $orig) {
            file_put_contents($fp, $c);
            echo "[✓] Added Demo Account Protection notice in {$fp}\n";
        }
    }
}

echo "[✓] Demo Preview Mode patching completed!\n";
