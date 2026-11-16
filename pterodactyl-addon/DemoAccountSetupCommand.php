<?php

namespace Pterodactyl\Console\Commands;

use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Backup;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Location;
use Pterodactyl\Models\Nest;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Schedule;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\Task;
use Pterodactyl\Models\User;
use Ramsey\Uuid\Uuid;

class DemoAccountSetupCommand extends Command
{
    protected $signature = 'ptero:demo-setup
        {--email= : Email for the demo account (default: demo@gmail.com)}
        {--password= : Password for the demo account (default: demo)}
        {--username= : Username for the demo account (default: demo)}
        {--name= : Display name for the dummy demo server (default: Survival SMP (Demo))}
        {--reset : Reset demo account credentials and sample dummy server data}
        {--remove : Remove the demo account, dummy server, and isolated demo node}';

    protected $description = 'Create, update, or remove the panel demo preview account and dummy server.';

    public function handle(): int
    {
        if ($this->option('remove')) {
            return $this->removeDemoEnvironment();
        }

        $email = trim((string) ($this->option('email') ?: env('DEMO_ACCOUNT_EMAIL', 'demo@gmail.com')));
        $password = (string) ($this->option('password') ?: env('DEMO_ACCOUNT_PASSWORD', 'demo'));
        $username = strtolower(trim((string) ($this->option('username') ?: env('DEMO_ACCOUNT_USERNAME', 'demo'))));
        $serverName = trim((string) ($this->option('name') ?: 'Survival SMP (Demo)'));
        $reset = (bool) $this->option('reset');

        if ($email === '' || $password === '' || $username === '') {
            $this->error('Demo email, username, and password must all be non-empty.');
            return 1;
        }

        $egg = $this->resolveDemoEgg();
        if (!$egg) {
            $this->error('No server eggs found in the database. Please run Pterodactyl seeders before creating a demo server.');
            return 1;
        }

        DB::beginTransaction();
        try {
            $demoUser = $this->ensureDemoUser($email, $password, $username, $reset);
            $demoNode = $this->ensureDemoNode();
            $demoAllocation = $this->ensureDemoAllocation($demoNode);
            $demoServer = $this->ensureDemoServer($demoUser, $demoNode, $demoAllocation, $egg, $serverName, $reset);

            $this->seedServerVariables($demoServer, $egg, $reset);
            $this->seedSampleBackups($demoServer, $reset);
            $this->seedAutoBackupSettings($demoServer, $reset);
            $this->seedSampleSchedules($demoServer, $reset);

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Failed to configure demo environment: ' . $e->getMessage());
            return 1;
        }

        $this->info('================================================================');
        $this->info('  Demo Preview Account & Dummy Server Ready!');
        $this->info('================================================================');
        $this->line("  Email:    {$demoUser->email}");
        $this->line("  Username: {$demoUser->username}");
        $this->line("  Password: {$password}");
        $this->line("  Server:   {$demoServer->name} ({$demoServer->uuidShort})");
        $this->line('  Status:   Read-only preview (cannot start server or edit account)');

        return 0;
    }

    private function ensureDemoUser(string $email, string $password, string $username, bool $reset): User
    {
        $hasIsDemo = Schema::hasColumn('users', 'is_demo');

        $user = null;
        if ($hasIsDemo) {
            $user = User::query()->where('is_demo', true)->first();
        }
        if (!$user) {
            $user = User::query()->whereRaw('LOWER(email) = ?', [mb_strtolower($email)])->first();
        }

        if (!$user) {
            $user = new User();
            $user->uuid = Uuid::uuid4()->toString();
        }

        // Ensure username does not collide with another non-demo user.
        $safeUsername = preg_replace('/[^a-z0-9._-]/', '', $username) ?: 'demo';
        $conflict = User::query()
            ->where('username', $safeUsername)
            ->when($user->exists, fn ($q) => $q->where('id', '!=', $user->id))
            ->exists();
        if ($conflict) {
            $safeUsername = 'demo_preview_' . substr(str_replace('-', '', $user->uuid), 0, 4);
        }

        $user->forceFill([
            'email' => $email,
            'username' => $safeUsername,
            'name_first' => 'Demo',
            'name_last' => 'Account',
            'root_admin' => false,
            'use_totp' => false,
            'totp_secret' => null,
            'language' => 'en',
            'gravatar' => true,
        ]);

        if (!$user->exists || $reset || $this->option('password') !== null) {
            $user->password = Hash::make($password);
        } elseif (empty($user->password)) {
            $user->password = Hash::make($password);
        }

        if ($hasIsDemo) {
            $user->is_demo = true;
        }

        $user->skipValidation()->save();

        return $user;
    }

    private function ensureDemoNode(): Node
    {
        $location = Location::query()->where('short', 'DEMO')->first();
        if (!$location) {
            $location = new Location();
            $location->forceFill([
                'short' => 'DEMO',
                'long' => 'Demo Preview Location',
            ])->skipValidation()->save();
        }

        $node = Node::query()->where('fqdn', 'demo.preview.local')->first()
            ?? Node::query()->where('name', 'Demo Preview')->first();

        if (!$node) {
            $node = new Node();
            $node->forceFill([
                'uuid' => Uuid::uuid4()->toString(),
                'public' => false,
                'name' => 'Demo Preview',
                'description' => 'Isolated virtual node for demo preview servers (no Wings daemon required).',
                'location_id' => $location->id,
                'fqdn' => 'demo.preview.local',
                'scheme' => 'https',
                'behind_proxy' => false,
                'maintenance_mode' => false,
                'memory' => 65536,
                'memory_overallocate' => 0,
                'disk' => 512000,
                'disk_overallocate' => 0,
                'upload_size' => 100,
                'daemonBase' => '/var/lib/pterodactyl/volumes',
                'daemonSFTP' => 2022,
                'daemonListen' => 8080,
                'daemon_token_id' => Str::random(Node::DAEMON_TOKEN_ID_LENGTH),
                'daemon_token' => app(Encrypter::class)->encrypt(Str::random(Node::DAEMON_TOKEN_LENGTH)),
            ])->skipValidation()->save();
        } else {
            $node->forceFill([
                'public' => false,
                'maintenance_mode' => false,
            ])->skipValidation()->save();
        }

        return $node;
    }

    private function ensureDemoAllocation(Node $node): Allocation
    {
        $allocation = Allocation::query()->where('node_id', $node->id)->orderBy('id')->first();
        if (!$allocation) {
            $allocation = new Allocation();
            $allocation->forceFill([
                'node_id' => $node->id,
                'ip' => '127.0.0.1',
                'ip_alias' => 'play.demo-server.net',
                'port' => 25565,
                'notes' => 'Demo Preview Allocation',
            ])->skipValidation()->save();
        }

        return $allocation;
    }

    private function ensureDemoServer(
        User $user,
        Node $node,
        Allocation $allocation,
        Egg $egg,
        string $serverName,
        bool $reset
    ): Server {
        $hasIsDemo = Schema::hasColumn('servers', 'is_demo');

        $server = null;
        if ($hasIsDemo) {
            $server = Server::query()->where('is_demo', true)->first();
        }
        if (!$server) {
            $server = Server::query()
                ->where('owner_id', $user->id)
                ->where('node_id', $node->id)
                ->first();
        }

        $isNew = !$server;
        if ($isNew) {
            $uuid = Uuid::uuid4()->toString();
            $server = new Server();
            $server->uuid = $uuid;
            $server->uuidShort = substr($uuid, 0, 8);
        }

        $dockerImage = $this->resolveDockerImage($egg);
        $startup = $egg->startup ?: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}';

        if ($isNew || $reset) {
            $server->forceFill([
                'owner_id' => $user->id,
                'node_id' => $node->id,
                'allocation_id' => $allocation->id,
                'nest_id' => $egg->nest_id,
                'egg_id' => $egg->id,
                'name' => $serverName,
                'description' => 'Interactive Demo Server — Explore all panel features! Starting the server & editing account credentials are disabled in demo mode.',
                'status' => null,
                'installed_at' => Carbon::now(),
                'skip_scripts' => false,
                'memory' => 8192,
                'swap' => 0,
                'disk' => 25600,
                'io' => 500,
                'cpu' => 200,
                'oom_disabled' => true,
                'startup' => $startup,
                'image' => $dockerImage,
                'database_limit' => 2,
                'allocation_limit' => 2,
                'backup_limit' => 5,
            ]);
        } else {
            $server->forceFill([
                'owner_id' => $user->id,
                'status' => null,
                'installed_at' => $server->installed_at ?: Carbon::now(),
            ]);
        }

        if ($hasIsDemo) {
            $server->is_demo = true;
        }

        // Populate addon columns if present in schema.
        if (Schema::hasColumn('servers', 'support_id') && empty($server->support_id)) {
            $code = 'SUP-DEMO01';
            if (Server::query()->where('support_id', $code)->when($server->exists, fn ($q) => $q->where('id', '!=', $server->id))->exists()) {
                $code = 'SUP-' . strtoupper(substr(str_replace('-', '', $server->uuid), 0, 6));
            }
            $server->support_id = $code;
        }
        if (Schema::hasColumn('servers', 'plan_name') && ($isNew || $reset || empty($server->plan_name))) {
            $server->plan_name = 'Diamond 8GB Demo';
        }
        if (Schema::hasColumn('servers', 'plan_price') && ($isNew || $reset || empty($server->plan_price))) {
            $server->plan_price = '$9.99/mo';
        }
        if (Schema::hasColumn('servers', 'expire_at')) {
            $server->expire_at = Carbon::now()->addDays(14);
        }
        if (Schema::hasColumn('servers', 'burst_cpu') && ($isNew || $reset)) {
            $server->burst_cpu = 300;
            if (Schema::hasColumn('servers', 'is_bursting')) {
                $server->is_bursting = false;
            }
        }

        $server->skipValidation()->save();

        $allocation->forceFill(['server_id' => $server->id])->skipValidation()->save();

        return $server;
    }

    private function resolveDemoEgg(): ?Egg
    {
        $preferredNames = ['Paper', 'Purpur', 'Spigot', 'Vanilla', 'Forge', 'Fabric'];
        foreach ($preferredNames as $name) {
            $match = Egg::query()->where('name', 'LIKE', "%{$name}%")->first();
            if ($match) {
                return $match;
            }
        }

        $mcNest = Nest::query()->where('name', 'LIKE', '%Minecraft%')->first();
        if ($mcNest) {
            $nestEgg = Egg::query()->where('nest_id', $mcNest->id)->first();
            if ($nestEgg) {
                return $nestEgg;
            }
        }

        return Egg::query()->orderBy('id')->first();
    }

    private function resolveDockerImage(Egg $egg): string
    {
        $images = $egg->docker_images;
        if (is_string($images)) {
            $decoded = json_decode($images, true);
            if (is_array($decoded)) {
                $images = $decoded;
            }
        }

        if (is_array($images) && !empty($images)) {
            $first = reset($images);
            if (is_string($first) && trim($first) !== '') {
                return trim($first);
            }
        }

        if (!empty($egg->docker_image) && is_string($egg->docker_image)) {
            return $egg->docker_image;
        }

        return 'ghcr.io/pterodactyl/yolks:java_21';
    }

    private function seedServerVariables(Server $server, Egg $egg, bool $reset): void
    {
        $egg->loadMissing('variables');
        if ($reset) {
            ServerVariable::query()->where('server_id', $server->id)->delete();
        }

        foreach ($egg->variables as $variable) {
            $exists = ServerVariable::query()
                ->where('server_id', $server->id)
                ->where('variable_id', $variable->id)
                ->exists();
            if (!$exists) {
                $defaultValue = (string) ($variable->default_value ?? '');
                if ($variable->env_variable === 'MINECRAFT_VERSION' && ($defaultValue === '' || $defaultValue === 'latest')) {
                    $defaultValue = '1.21.1';
                } elseif ($variable->env_variable === 'SERVER_JARFILE' && $defaultValue === '') {
                    $defaultValue = 'server.jar';
                }

                ServerVariable::query()->create([
                    'server_id' => $server->id,
                    'variable_id' => $variable->id,
                    'variable_value' => $defaultValue,
                ]);
            }
        }
    }

    private function seedSampleBackups(Server $server, bool $reset): void
    {
        if ($reset) {
            Backup::withTrashed()->where('server_id', $server->id)->forceDelete();
        }

        if (Backup::query()->where('server_id', $server->id)->exists()) {
            return;
        }

        $samples = [
            [
                'name' => 'Automated Daily Backup — Preview',
                'bytes' => 412876800,
                'is_locked' => false,
                'completed_at' => Carbon::now()->subHours(6),
                'checksum' => 'sha256:9f84c2e17b09d4a62a9f45e13208c7a3',
            ],
            [
                'name' => 'Pre-Update Snapshot',
                'bytes' => 389120000,
                'is_locked' => true,
                'completed_at' => Carbon::now()->subDays(2),
                'checksum' => 'sha256:4a1b7c93e6f208d15c34a8b09d712e4f',
            ],
        ];

        foreach ($samples as $sample) {
            $backup = new Backup();
            $backup->forceFill([
                'server_id' => $server->id,
                'uuid' => Uuid::uuid4()->toString(),
                'is_successful' => true,
                'is_locked' => $sample['is_locked'],
                'name' => $sample['name'],
                'ignored_files' => ['*.log', 'cache/*'],
                'disk' => Backup::ADAPTER_WINGS,
                'checksum' => $sample['checksum'],
                'bytes' => $sample['bytes'],
                'completed_at' => $sample['completed_at'],
            ])->skipValidation()->save();
        }
    }

    private function seedAutoBackupSettings(Server $server, bool $reset): void
    {
        if (!Schema::hasTable('server_backup_settings')) {
            return;
        }

        $exists = DB::table('server_backup_settings')->where('server_id', $server->id)->exists();
        if ($exists && !$reset) {
            return;
        }

        $payload = [
            'is_enabled' => true,
            'backup_time' => '03:00',
            'last_run_at' => Carbon::now()->subHours(6),
            'last_backup_name' => 'Automated Daily Backup — Preview',
            'gdrive_enabled' => false,
            'updated_at' => Carbon::now(),
        ];

        if ($exists) {
            DB::table('server_backup_settings')->where('server_id', $server->id)->update($payload);
        } else {
            $payload['server_id'] = $server->id;
            $payload['created_at'] = Carbon::now();
            DB::table('server_backup_settings')->insert($payload);
        }
    }

    private function seedSampleSchedules(Server $server, bool $reset): void
    {
        if ($reset) {
            $ids = Schedule::query()->where('server_id', $server->id)->pluck('id');
            if ($ids->isNotEmpty()) {
                Task::query()->whereIn('schedule_id', $ids)->delete();
                Schedule::query()->whereIn('id', $ids)->delete();
            }
        }

        if (Schedule::query()->where('server_id', $server->id)->exists()) {
            return;
        }

        $restart = new Schedule();
        $restart->forceFill([
            'server_id' => $server->id,
            'name' => 'Daily Auto-Restart & World Save (Preview)',
            'cron_day_of_week' => '*',
            'cron_month' => '*',
            'cron_day_of_month' => '*',
            'cron_hour' => '4',
            'cron_minute' => '0',
            'is_active' => false,
            'is_processing' => false,
            'only_when_online' => true,
            'last_run_at' => Carbon::now()->subDay(),
            'next_run_at' => null,
        ])->skipValidation()->save();

        Task::query()->create([
            'schedule_id' => $restart->id,
            'sequence_id' => 1,
            'action' => Task::ACTION_COMMAND,
            'payload' => 'say Server restarting in 60 seconds — saving all chunks...',
            'time_offset' => 0,
            'is_queued' => false,
            'continue_on_failure' => true,
        ]);

        Task::query()->create([
            'schedule_id' => $restart->id,
            'sequence_id' => 2,
            'action' => Task::ACTION_POWER,
            'payload' => 'restart',
            'time_offset' => 60,
            'is_queued' => false,
            'continue_on_failure' => false,
        ]);
    }

    private function removeDemoEnvironment(): int
    {
        DB::beginTransaction();
        try {
            $hasUserDemo = Schema::hasColumn('users', 'is_demo');
            $hasServerDemo = Schema::hasColumn('servers', 'is_demo');

            $demoUsers = User::query()
                ->where(function ($q) use ($hasUserDemo) {
                    $defaultEmail = (string) env('DEMO_ACCOUNT_EMAIL', 'demo@gmail.com');
                    if ($hasUserDemo) {
                        $q->where('is_demo', true)->orWhere('email', $defaultEmail);
                    } else {
                        $q->where('email', $defaultEmail);
                    }
                })
                ->get();

            $userIds = $demoUsers->pluck('id')->all();

            if (!$hasServerDemo && empty($userIds)) {
                $demoServers = collect();
            } else {
                $demoServers = Server::query()
                    ->where(function ($q) use ($hasServerDemo, $userIds) {
                        if ($hasServerDemo) {
                            $q->where('is_demo', true);
                        }
                        if (!empty($userIds)) {
                            $hasServerDemo
                                ? $q->orWhereIn('owner_id', $userIds)
                                : $q->whereIn('owner_id', $userIds);
                        }
                    })
                    ->get();
            }

            foreach ($demoServers as $server) {
                $scheduleIds = Schedule::query()->where('server_id', $server->id)->pluck('id');
                if ($scheduleIds->isNotEmpty()) {
                    Task::query()->whereIn('schedule_id', $scheduleIds)->delete();
                    Schedule::query()->whereIn('id', $scheduleIds)->delete();
                }

                Backup::withTrashed()->where('server_id', $server->id)->forceDelete();
                ServerVariable::query()->where('server_id', $server->id)->delete();

                if (Schema::hasTable('server_backup_settings')) {
                    DB::table('server_backup_settings')->where('server_id', $server->id)->delete();
                }

                Allocation::query()->where('server_id', $server->id)->update(['server_id' => null]);
                $server->delete();
            }

            $demoNode = Node::query()->where('fqdn', 'demo.preview.local')->first();
            if ($demoNode && !Server::query()->where('node_id', $demoNode->id)->exists()) {
                Allocation::query()->where('node_id', $demoNode->id)->delete();
                $demoNode->delete();
            }

            $demoLocation = Location::query()->where('short', 'DEMO')->first();
            if ($demoLocation && !Node::query()->where('location_id', $demoLocation->id)->exists()) {
                $demoLocation->delete();
            }

            foreach ($demoUsers as $demoUser) {
                $demoUser->delete();
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Failed to remove demo environment: ' . $e->getMessage());
            return 1;
        }

        $this->info('Demo account, dummy server, and isolated demo node removed cleanly.');
        return 0;
    }
}
