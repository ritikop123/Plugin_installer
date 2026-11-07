<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            if (!Schema::hasColumn('servers', 'burst_cpu')) {
                $table->integer('burst_cpu')->unsigned()->default(0)->after('cpu');
            }
            if (!Schema::hasColumn('servers', 'is_bursting')) {
                $table->boolean('is_bursting')->default(false)->after('burst_cpu');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            if (Schema::hasColumn('servers', 'is_bursting')) {
                $table->dropColumn('is_bursting');
            }
            if (Schema::hasColumn('servers', 'burst_cpu')) {
                $table->dropColumn('burst_cpu');
            }
        });
    }
};
