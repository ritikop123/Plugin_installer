import React, { useState, useEffect, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';

interface Props {
    uptime?: number | null;
    status?: string | null;
    stats?: any;
    className?: string;
}

const ServerUptime: React.FC<Props> = ({ uptime: propUptime, status: propStatus, stats, className = '' }) => {
    const serverStatus = ServerContext.useStoreState((state) => state.status.value);
    const socketInstance = ServerContext.useStoreState((state) => state.socket.instance);
    const [liveUptime, setLiveUptime] = useState<number>(0);

    // Request stats from daemon Wings on socket connect
    useEffect(() => {
        if (!socketInstance) return;
        try {
            socketInstance.send(SocketRequest.SEND_STATS);
        } catch {}
    }, [socketInstance]);

    // Live stats listener from daemon WebSocket
    useWebsocketEvent(SocketEvent.STATS, (data: string) => {
        try {
            const values = JSON.parse(data);
            if (typeof values.uptime === 'number') {
                setLiveUptime(values.uptime);
            }
        } catch {}
    });

    const rawUptime = propUptime !== undefined && propUptime !== null && propUptime > 0
        ? propUptime
        : (liveUptime > 0 ? liveUptime : (stats?.uptime ?? stats?.resources?.uptime ?? 0));

    const rawStatus = propStatus !== undefined && propStatus !== null
        ? propStatus
        : (serverStatus || stats?.status || stats?.state || null);

    const formatted = useMemo(() => {
        const isRunning = rawStatus === 'running' || (!rawStatus && typeof rawUptime === 'number' && rawUptime > 0);

        if (!isRunning || !rawUptime || typeof rawUptime !== 'number' || rawUptime <= 0) {
            if (rawStatus === 'starting') {
                return { text: 'Starting...', title: 'Server is starting up', state: 'starting' };
            }
            if (rawStatus === 'stopping') {
                return { text: 'Stopping...', title: 'Server is stopping', state: 'stopping' };
            }
            return { text: 'Offline', title: 'Server is offline', state: 'offline' };
        }

        const now = Date.now();
        let seconds = 0;

        if (rawUptime > 1000000000000) {
            // Milliseconds epoch timestamp
            seconds = Math.max(0, Math.floor((now - rawUptime) / 1000));
        } else if (rawUptime > 1000000000) {
            // Seconds epoch timestamp
            seconds = Math.max(0, Math.floor(now / 1000 - rawUptime));
        } else if (rawUptime > 100000) {
            // Milliseconds duration (Wings proc.Uptime())
            seconds = Math.floor(rawUptime / 1000);
        } else {
            // Seconds duration
            seconds = Math.floor(rawUptime);
        }

        if (seconds <= 0) {
            return { text: '< 1m', title: 'Server started less than a minute ago', state: 'online' };
        }

        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        let text = '';
        let fullTitle = 'Uptime: ';

        if (days > 0) {
            text = `${days}d ${hours}h ${minutes}m`;
            fullTitle += `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}, ${minutes} min`;
        } else if (hours > 0) {
            text = `${hours}h ${minutes}m`;
            fullTitle += `${hours} hour${hours > 1 ? 's' : ''}, ${minutes} min`;
        } else {
            text = `${minutes}m`;
            fullTitle += `${minutes} minute${minutes > 1 ? 's' : ''}`;
        }

        return { text, title: fullTitle, state: 'online' };
    }, [rawUptime, rawStatus]);

    return (
        <div
            title={formatted.title}
            className={`inline-flex items-center gap-1.5 text-sm select-none ${className}`}
        >
            <span className="text-gray-400 font-normal">Uptime:</span>
            <span
                className={`font-mono font-medium ${
                    formatted.state === 'online'
                        ? 'text-gray-200'
                        : formatted.state === 'starting'
                        ? 'text-amber-300'
                        : 'text-gray-400'
                }`}
            >
                {formatted.text}
            </span>
        </div>
    );
};

export default ServerUptime;
