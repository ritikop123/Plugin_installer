<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('server_backup_settings')) {
            Schema::create('server_backup_settings', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('server_id')->unique();
                $table->boolean('is_enabled')->default(false);
                $table->string('backup_time', 10)->default('03:00');
                $table->timestamp('last_run_at')->nullable();
                $table->string('last_backup_name', 191)->nullable();
                $table->boolean('gdrive_enabled')->default(false);
                $table->longText('gdrive_data')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('server_backup_settings');
    }
};
