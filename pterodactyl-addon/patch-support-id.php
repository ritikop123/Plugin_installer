<?php

$serverModelFile = 'app/Models/Server.php';
if (!file_exists($serverModelFile)) {
    fwrite(STDERR, "[!] Server model not found; cannot generate support IDs for new servers.\n");
    exit(1);
}

$content = file_get_contents($serverModelFile);
if ($content === false) {
    fwrite(STDERR, "[!] Could not read the Server model.\n");
    exit(1);
}

$content = preg_replace(
    '/\/\*\s*>>>\s*ARIX SERVER SUPPORT ID START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX SERVER SUPPORT ID END\s*<<<\s*\*\/\s*/s',
    '',
    $content
);

$event = <<<'PATCH'
        /* >>> ARIX SERVER SUPPORT ID START >>> */
        static::creating(function (\Pterodactyl\Models\Server $server) {
            if (empty($server->support_id) && !empty($server->uuid)) {
                $server->support_id = 'SUP-' . strtoupper(str_replace('-', '', $server->uuid));
            }
        });
        /* <<< ARIX SERVER SUPPORT ID END <<< */

PATCH;

if (preg_match('/(protected static function booted\(\)\s*(?::\s*void)?\s*\{)/', $content)) {
    $content = preg_replace('/(protected static function booted\(\)\s*(?::\s*void)?\s*\{)/', "$1\n" . $event, $content, 1, $count);
    if ($count !== 1) {
        fwrite(STDERR, "[!] Could not add the support ID creation hook to the Server model.\n");
        exit(1);
    }
} elseif (preg_match('/(class Server extends Model[^{]*\{)/', $content)) {
    $content = preg_replace(
        '/(class Server extends Model[^{]*\{)/',
        "$1\n    protected static function booted()\n    {\n        parent::booted();\n" . $event . "    }\n",
        $content,
        1,
        $count
    );
    if ($count !== 1) {
        fwrite(STDERR, "[!] Could not add the support ID creation hook to the Server model.\n");
        exit(1);
    }
} else {
    fwrite(STDERR, "[!] Could not locate the Server model boot method or class declaration.\n");
    exit(1);
} else {
    fwrite(STDERR, "[!] Could not locate the Server model class declaration.\n");
    exit(1);
}

if (file_put_contents($serverModelFile, $content) === false) {
    fwrite(STDERR, "[!] Could not write the Server model.\n");
    exit(1);
}

$serverFilterFile = 'app/Models/Filters/AdminServerFilter.php';
if (!file_exists($serverFilterFile)) {
    fwrite(STDERR, "[!] Admin server filter not found; support-ID search could not be enabled.\n");
    exit(1);
}

$content = file_get_contents($serverFilterFile);
if ($content === false) {
    fwrite(STDERR, "[!] Could not read the admin server filter.\n");
    exit(1);
}

if (strpos($content, 'servers.support_id') === false) {
    $updated = str_replace(
        "->orWhere('servers.external_id', \$value)",
        "->orWhere('servers.external_id', \$value)\n                    ->orWhereRaw('LOWER(servers.support_id) LIKE ?', [strtolower(\$value) . '%'])",
        $content
    );

    if ($updated === $content) {
        fwrite(STDERR, "[!] Could not locate the admin server filter insertion point.\n");
        exit(1);
    }

    $content = $updated;
}

if (file_put_contents($serverFilterFile, $content) === false) {
    fwrite(STDERR, "[!] Could not write the admin server filter.\n");
    exit(1);
}

$serverListFile = 'resources/views/admin/servers/index.blade.php';
if (!file_exists($serverListFile)) {
    fwrite(STDERR, "[!] Admin server list view not found; support-ID column could not be added.\n");
    exit(1);
}

$content = file_get_contents($serverListFile);
if ($content === false) {
    fwrite(STDERR, "[!] Could not read the admin server list view.\n");
    exit(1);
}

$content = preg_replace('/placeholder="Search Servers"/', 'placeholder="Search by name, UUID, support ID, owner"', $content);
if (strpos($content, '$server->support_id') === false) {
    $content = str_replace('<th>UUID</th>', '<th>UUID</th>' . "\n                            <th>Support ID</th>", $content, $headerCount);
    if ($headerCount !== 1) {
        fwrite(STDERR, "[!] Could not locate the UUID header in the admin server list view.\n");
        exit(1);
    }
    $content = preg_replace(
        '/(<td><code title="\{\{ \$server->uuid \}\}">\{\{ \$server->uuid \}\}<\/code><\/td>)/',
        "$1\n                                <td><code>{{ \$server->support_id }}</code></td>",
        $content,
        1,
        $count
    );

    if ($count !== 1) {
        fwrite(STDERR, "[!] Could not locate the server UUID cell in the admin list view.\n");
        exit(1);
    }
}

if (file_put_contents($serverListFile, $content) === false) {
    fwrite(STDERR, "[!] Could not write the admin server list view.\n");
    exit(1);
}

$transformerFile = 'app/Transformers/Api/Client/ServerTransformer.php';
if (!file_exists($transformerFile)) {
    fwrite(STDERR, "[!] Client server transformer not found; support IDs cannot be exposed to the panel.\n");
    exit(1);
}

$content = file_get_contents($transformerFile);
if ($content === false) {
    fwrite(STDERR, "[!] Could not read the client server transformer.\n");
    exit(1);
}

$content = preg_replace(
    '/\/\*\s*>>>\s*ARIX SERVER SUPPORT ID TRANSFORMER START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX SERVER SUPPORT ID TRANSFORMER END\s*<<<\s*\*\/\s*/s',
    '',
    $content
);
$transformerPatch = <<<'PATCH'
            /* >>> ARIX SERVER SUPPORT ID TRANSFORMER START >>> */
            'support_id' => $server->support_id,
            /* <<< ARIX SERVER SUPPORT ID TRANSFORMER END <<< */
PATCH;

if (strpos($content, "'support_id' =>") === false) {
    $updated = preg_replace('/(\x27uuid\x27\s*=>[^\n]+,\s*)/', "$1\n" . $transformerPatch . "\n", $content, 1, $count);
    if ($count !== 1) {
        fwrite(STDERR, "[!] Could not locate the UUID field in the client server transformer.\n");
        exit(1);
    }
    $content = $updated;
}

if (file_put_contents($transformerFile, $content) === false) {
    fwrite(STDERR, "[!] Could not write the client server transformer.\n");
    exit(1);
}

$getServerFile = 'resources/scripts/api/server/getServer.ts';
if (!file_exists($getServerFile)) {
    fwrite(STDERR, "[!] Server API mapper not found; support IDs cannot be typed in the panel.\n");
    exit(1);
}

$content = file_get_contents($getServerFile);
if ($content === false) {
    fwrite(STDERR, "[!] Could not read the server API mapper.\n");
    exit(1);
}

$content = preg_replace(
    '/\/\*\s*>>>\s*ARIX SERVER SUPPORT ID API START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX SERVER SUPPORT ID API END\s*<<<\s*\*\/\s*/s',
    '',
    $content
);

if (strpos($content, 'support_id?: string | null;') === false) {
    $content = preg_replace(
        '/(\buuid\??:\s*string(?:\s*\|\s*null)?;\s*)/',
        "$1    /* >>> ARIX SERVER SUPPORT ID API START >>> */\n    support_id?: string | null;\n    /* <<< ARIX SERVER SUPPORT ID API END <<< */\n",
        $content,
        1,
        $count
    );
    if ($count !== 1) {
        fwrite(STDERR, "[!] Could not locate the server UUID type in the server API mapper.\n");
        exit(1);
    }
}

if (strpos($content, 'support_id: (data as any)') === false) {
    $content = preg_replace(
        '/(\buuid:\s*data\.uuid,\s*)/',
        "$1    /* >>> ARIX SERVER SUPPORT ID API START >>> */\n    support_id: (data as any).support_id || null,\n    /* <<< ARIX SERVER SUPPORT ID API END <<< */\n",
        $content,
        1,
        $count
    );
    if ($count !== 1) {
        fwrite(STDERR, "[!] Could not locate the server UUID mapping in the server API mapper.\n");
        exit(1);
    }
}

if (file_put_contents($getServerFile, $content) === false) {
    fwrite(STDERR, "[!] Could not write the server API mapper.\n");
    exit(1);
}

echo "[+] Support ID generation, display, and admin search are installed.\n";
