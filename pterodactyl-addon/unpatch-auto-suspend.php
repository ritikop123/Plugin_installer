<?php

$files = [
    'resources/views/admin/servers/new.blade.php',
    'resources/views/admin/servers/view/build.blade.php',
    'resources/views/admin/servers/view/details.blade.php',
    'app/Http/Controllers/Admin/Servers/CreateServerController.php',
    'app/Http/Controllers/Admin/ServersController.php',
    'app/Console/Kernel.php',
    'app/Models/Server.php',
];

foreach ($files as $file) {
    if (file_exists($file)) {
        $c = file_get_contents($file);
        $c = preg_replace('/<!--\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*-->.*?<!--\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*-->\s*/s', '', $c);
        $c = preg_replace('/\/\*\s*>>>\s*ARIX AUTO SUSPENSION START\s*>>>\s*\*\/.*?\/\*\s*<<<\s*ARIX AUTO SUSPENSION END\s*<<<\s*\*\/\s*/s', '', $c);
        file_put_contents($file, $c);
    }
}
