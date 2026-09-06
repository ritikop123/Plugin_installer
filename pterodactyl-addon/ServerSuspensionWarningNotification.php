<?php

namespace Pterodactyl\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Pterodactyl\Models\Server;

class ServerSuspensionWarningNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(public Server $server, public int $daysLeft = 3)
    {
    }

    public function via(): array
    {
        return ['mail'];
    }

    public function toMail(): MailMessage
    {
        $serverName = $this->server->name;
        $expireDate = $this->server->expire_at
            ? $this->server->expire_at->toFormattedDateString() . ' (' . $this->server->expire_at->format('H:i T') . ')'
            : 'soon';
        $panelUrl = config('app.url') . '/server/' . $this->server->uuidShort;

        return (new MailMessage())
            ->subject('Notice: Your server ' . $serverName . ' is expiring in ' . $this->daysLeft . ' days')
            ->greeting('Hello ' . $this->server->user->name . ',')
            ->line('This is a courteous reminder that your server **' . $serverName . '** is scheduled for auto-suspension.')
            ->line('**Scheduled Expiration:** ' . $expireDate)
            ->line('To avoid service interruption or suspension of your server, please ensure your service is renewed before the scheduled date.')
            ->action('Manage Server', $panelUrl)
            ->line('Thank you for hosting with Sagarmatha Hosting!');
    }
}
