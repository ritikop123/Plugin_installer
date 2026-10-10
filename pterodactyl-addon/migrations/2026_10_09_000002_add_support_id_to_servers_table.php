<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('servers', 'support_id')) {
            Schema::table('servers', function (Blueprint $table) {
                $table->string('support_id', 36)->nullable()->after('uuid')->unique();
            });
        }

        DB::table('servers')
            ->select('id', 'uuid', 'support_id')
            ->where(function ($query) {
                $query->whereNull('support_id')
                    ->orWhereRaw('LENGTH(support_id) > 10');
            })
            ->orderBy('id')
            ->chunkById(200, function ($servers): void {
                foreach ($servers as $server) {
                    $shortCode = 'SUP-' . strtoupper(substr(str_replace('-', '', $server->uuid), 0, 6));
                    DB::table('servers')
                        ->where('id', $server->id)
                        ->update([
                            'support_id' => $shortCode,
                        ]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('servers', 'support_id')) {
            Schema::table('servers', function (Blueprint $table) {
                $table->dropUnique(['support_id']);
                $table->dropColumn('support_id');
            });
        }
    }
};
