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
        Schema::table("servers", function (Blueprint $table) {
            if (!Schema::hasColumn("servers", "plan_name")) {
                $table->string("plan_name", 191)->nullable()->after("expire_at");
            }
            if (!Schema::hasColumn("servers", "plan_price")) {
                $table->string("plan_price", 191)->nullable()->after("plan_name");
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table("servers", function (Blueprint $table) {
            if (Schema::hasColumn("servers", "plan_name")) {
                $table->dropColumn("plan_name");
            }
            if (Schema::hasColumn("servers", "plan_price")) {
                $table->dropColumn("plan_price");
            }
        });
    }
};
