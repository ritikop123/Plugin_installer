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
            if (!Schema::hasColumn('servers', 'expire_at')) {
                $table->timestamp('expire_at')->nullable()->after('status')->index();
            }
            if (!Schema::hasColumn('servers', 'expiration_warning_sent_at')) {
                $table->timestamp('expiration_warning_sent_at')->nullable()->after('expire_at');
            }
            if (!Schema::hasColumn('servers', 'plan_name')) {
                $table->string('plan_name', 191)->nullable()->after('expiration_warning_sent_at');
            }
            if (!Schema::hasColumn('servers', 'plan_price')) {
                $table->string('plan_price', 191)->nullable()->after('plan_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('servers', function (Blueprint $table) {
            if (Schema::hasColumn('servers', 'expire_at')) {
                $table->dropColumn('expire_at');
            }
            if (Schema::hasColumn('servers', 'expiration_warning_sent_at')) {
                $table->dropColumn('expiration_warning_sent_at');
            }
        });
    }
};
