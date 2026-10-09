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
            ->select('id', 'uuid')
            ->whereNull('support_id')
            ->orderBy('id')
            ->chunkById(200, function ($servers): void {
                foreach ($servers as $server) {
                    DB::table('servers')
                        ->where('id', $server->id)
                        ->whereNull('support_id')
                        ->update([
                            'support_id' => 'SUP-' . strtoupper(str_replace('-', '', $server->uuid)),
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
