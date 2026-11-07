<?php

$files = [
    "resources/views/admin/servers/new.blade.php",
    "resources/views/admin/servers/view/build.blade.php",
    "resources/views/admin/servers/view/details.blade.php",
    "app/Http/Controllers/Admin/Servers/CreateServerController.php",
    "app/Http/Controllers/Admin/ServersController.php",
    "app/Http/Controllers/Admin/Servers/ServerBuildController.php",
    "app/Transformers/Api/Client/ServerTransformer.php",
    "app/Transformers/Api/Application/ServerTransformer.php",
    "routes/api-client.php",
    "app/Console/Kernel.php",
    "app/Models/Server.php",
    "resources/scripts/api/server/getServer.ts",
    "resources/scripts/api/getServers.ts",
];

foreach ($files as $file) {
    if (file_exists($file)) {
        $c = file_get_contents($file);
        $c = preg_replace("/<!--\\s*>>>\\s*ARIX AUTO SUSPENSION START\\s*>>>\\s*-->.*?<!--\\s*<<<\\s*ARIX AUTO SUSPENSION END\\s*<<<\\s*-->\\s*/s", "", $c);
        $c = preg_replace("/\\/\\*\\s*>>>\\s*ARIX AUTO SUSPENSION START\\s*>>>\\s*\\*\\/.*?\\/\\*\\s*<<<\\s*ARIX AUTO SUSPENSION END\\s*<<<\\s*\\*\\/\\s*/s", "", $c);
        $c = preg_replace("/<!--\\s*>>>\\s*ARIX BURST CPU START\\s*>>>\\s*-->.*?<!--\\s*<<<\\s*ARIX BURST CPU END\\s*<<<\\s*-->\\s*/s", "", $c);
        $c = preg_replace("/\\/\\*\\s*>>>\\s*ARIX BURST CPU START\\s*>>>\\s*\\*\\/.*?\\/\\*\\s*<<<\\s*ARIX BURST CPU END\\s*<<<\\s*\\*\\/\\s*/s", "", $c);
        $c = preg_replace("/\\/\\*\\s*>>>\\s*ARIX BURST CPU CLIENT START\\s*>>>\\s*\\*\\/.*?\\/\\*\\s*<<<\\s*ARIX BURST CPU CLIENT END\\s*<<<\\s*\\*\\/\\s*/s", "", $c);
        $c = str_replace('<label for="pCPU">Real CPU Limit</label>', '<label for="pCPU">CPU Limit</label>', $c);
        $c = str_replace('<label for="cpu" class="control-label">Real CPU Limit</label>', '<label for="cpu" class="control-label">CPU Limit</label>', $c);
        file_put_contents($file, $c);
    }
}

$structServiceFile = "app/Services/Servers/ServerConfigurationStructureService.php";
if (file_exists($structServiceFile)) {
    $c = file_get_contents($structServiceFile);
    $c = str_replace(
        "'cpu_limit' => (\$server->is_bursting && (\$server->burst_cpu ?? 0) > \$server->cpu) ? (int) \$server->burst_cpu : \$server->cpu,",
        "'cpu_limit' => \$server->cpu,",
        $c
    );
    $c = str_replace(
        "'io_weight' => (\$server->is_bursting && (\$server->burst_cpu ?? 0) > \$server->cpu) ? max(10, (int) (\$server->io / 2)) : \$server->io,",
        "'io_weight' => \$server->io,",
        $c
    );
    $c = str_replace(
        "'cpu' => (\$server->is_bursting && (\$server->burst_cpu ?? 0) > \$server->cpu) ? (int) \$server->burst_cpu : (int) \$server->cpu,",
        "'cpu' => (int) \$server->cpu,",
        $c
    );
    file_put_contents($structServiceFile, $c);
}

$lowResFile = "resources/scripts/components/server/LowResourcesAlert.tsx";
if (file_exists($lowResFile)) {
    $c = file_get_contents($lowResFile);
    $c = str_replace(
        "getBackgroundColor(stats.cpu, stats.uptime / 1000, (limits as any).burst_cpu > limits.cpu ? (limits as any).burst_cpu : limits.cpu)",
        "getBackgroundColor(stats.cpu, stats.uptime / 1000, limits.cpu)",
        $c
    );
    file_put_contents($lowResFile, $c);
}
