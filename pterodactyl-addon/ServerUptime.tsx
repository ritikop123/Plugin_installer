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
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0d131f]/85 border border-neutral-700/60 shadow-sm backdrop-blur-sm select-none transition-all duration-200 hover:border-[#034f80]/80 ${className}`}
        >
            {formatted.state === 'online' ? (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
            ) : formatted.state === 'starting' ? (
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
            ) : (
                <span className="inline-flex rounded-full h-2 w-2 bg-neutral-600"></span>
            )}

            <svg
                className={`w-3.5 h-3.5 ${
                    formatted.state === 'online'
                        ? 'text-emerald-400'
                        : formatted.state === 'starting'
                        ? 'text-amber-400'
                        : 'text-neutral-500'
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>

            <span className="text-xs text-neutral-400 font-medium">Uptime:</span>
            <span
                className={`text-xs sm:text-sm font-semibold font-mono tracking-tight ${
                    formatted.state === 'online'
                        ? 'text-neutral-100'
                        : formatted.state === 'starting'
                        ? 'text-amber-300'
                        : 'text-neutral-400'
                }`}
            >
                {formatted.text}
            </span>
        </div>
    );
};

export default ServerUptime;
