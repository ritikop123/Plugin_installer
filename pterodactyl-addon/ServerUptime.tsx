import React, { useState, useEffect, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import http from '@/api/http';

interface Props {
    uptime?: number | null;
    status?: string | null;
    stats?: any;
    className?: string;
}

const ServerUptime: React.FC<Props> = ({ uptime: propUptime, status: propStatus, stats, className = '' }) => {
    const serverUuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const serverStatus = ServerContext.useStoreState((state) => state.status.value);
    const socketInstance = ServerContext.useStoreState((state) => state.socket.instance);
    const storeExpireAt = ServerContext.useStoreState(
        (state) => (state.server.data as any)?.expire_at || (state.server.data as any)?.expireAt
    );

    const [liveExpireAt, setLiveExpireAt] = useState<string | null>(storeExpireAt || null);
    const [liveUptime, setLiveUptime] = useState<number>(0);
    const [liveStatus, setLiveStatus] = useState<string | null>(serverStatus || null);

    // Keep liveExpireAt synced if storeExpireAt updates
    useEffect(() => {
        if (storeExpireAt) {
            setLiveExpireAt(storeExpireAt);
        }
    }, [storeExpireAt]);

    // Keep liveStatus in sync and reset uptime when server transitions to offline or starting
    useEffect(() => {
        if (serverStatus) {
            setLiveStatus(serverStatus);
            if (serverStatus === 'offline' || serverStatus === 'starting') {
                setLiveUptime(0);
            }
        }
    }, [serverStatus]);

    // Fetch fresh subscription details and listen to real-time update events
    useEffect(() => {
        if (!serverUuid) return;

        // Fetch fresh subscription details
        http.get(`/api/client/servers/${serverUuid}/subscription`)
            .then(({ data }) => {
                const sub = data?.data || data;
                const exp = data?.expire_at !== undefined ? data.expire_at : (sub?.expires_at ?? sub?.expire_at);
                if (exp !== undefined) {
                    setLiveExpireAt(exp || null);
                }
            })
            .catch(() => {
                http.get(`/api/client/servers/${serverUuid}/options`)
                    .then(({ data }) => {
                        if (data.expire_at !== undefined) {
                            setLiveExpireAt(data.expire_at || null);
                        }
                    })
                    .catch(() => {});
            });

        // Event listener when ServerExpiryCard updates or fetches new data
        const handleExpireUpdated = (e: any) => {
            if (e.detail?.expire_at !== undefined) {
                setLiveExpireAt(e.detail.expire_at || null);
            }
        };

        window.addEventListener('server:expire_at_updated', handleExpireUpdated);
        return () => {
            window.removeEventListener('server:expire_at_updated', handleExpireUpdated);
        };
    }, [serverUuid]);

    // Request stats from daemon Wings on socket connect
    useEffect(() => {
        if (!socketInstance) return;
        try {
            socketInstance.send(SocketRequest.SEND_STATS);
        } catch {}
    }, [socketInstance]);

    // Listen to real-time status events from daemon WebSocket
    useWebsocketEvent(SocketEvent.STATUS, (status: string) => {
        setLiveStatus(status);
        if (status === 'offline' || status === 'starting') {
            setLiveUptime(0);
        }
    });

    // Live stats listener from daemon WebSocket
    useWebsocketEvent(SocketEvent.STATS, (data: string) => {
        try {
            const values = JSON.parse(data);
            if (typeof values.uptime === 'number') {
                setLiveUptime(values.uptime);
            }
            if (typeof values.state === 'string' && values.state) {
                setLiveStatus(values.state);
            }
        } catch {}
    });

    const rawStatus = propStatus !== undefined && propStatus !== null
        ? propStatus
        : (liveStatus || serverStatus || stats?.status || stats?.state || null);

    const formatted = useMemo(() => {
        // Handle explicit known states first
        if (rawStatus === 'starting') {
            return { text: 'Starting...', title: 'Server is starting up', state: 'starting' };
        }
        if (rawStatus === 'stopping') {
            return { text: 'Stopping...', title: 'Server is stopping', state: 'stopping' };
        }
        if (rawStatus === 'offline') {
            return { text: 'Offline', title: 'Server is offline', state: 'offline' };
        }

        // When status is running, or status is unknown/null but we have active uptime
        const isRunning = rawStatus === 'running' || (!rawStatus && (liveUptime > 0 || (propUptime ?? 0) > 0));

        if (!isRunning) {
            return { text: 'Offline', title: 'Server is offline', state: 'offline' };
        }

        let seconds = 0;
        if (propUptime !== undefined && propUptime !== null && propUptime > 0) {
            if (propUptime > 1000000000000) {
                // Milliseconds epoch timestamp
                seconds = Math.max(0, Math.floor((Date.now() - propUptime) / 1000));
            } else if (propUptime > 1000000000) {
                // Seconds epoch timestamp
                seconds = Math.max(0, Math.floor(Date.now() / 1000 - propUptime));
            } else {
                // Duration passed via prop
                seconds = Math.floor(propUptime);
            }
        } else {
            // Wings daemon stats.uptime is ALWAYS duration in milliseconds
            const ms = liveUptime > 0 ? liveUptime : (stats?.uptime ?? stats?.resources?.uptime ?? 0);
            seconds = Math.floor(ms / 1000);
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
        } else if (minutes > 0) {
            text = `${minutes}m`;
            fullTitle += `${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else {
            text = '< 1m';
            fullTitle += 'less than a minute';
        }

        return { text, title: fullTitle, state: 'online' };
    }, [rawStatus, liveUptime, propUptime, stats]);

    const suspendFormatted = useMemo(() => {
        if (!liveExpireAt || liveExpireAt === 'N/A' || liveExpireAt === 'null' || liveExpireAt === 'undefined') {
            return {
                text: '∞',
                title: 'No expiration set (Unlimited / Lifetime)',
                isInfinity: true,
                isExpired: false,
                isWarning: false,
            };
        }

        const normalizedDate = typeof liveExpireAt === 'string' ? liveExpireAt.replace(' ', 'T') : liveExpireAt;
        const expiryTime = new Date(normalizedDate).getTime();
        if (isNaN(expiryTime)) {
            return {
                text: '∞',
                title: 'No expiration set (Unlimited / Lifetime)',
                isInfinity: true,
                isExpired: false,
                isWarning: false,
            };
        }

        const now = Date.now();
        const diffMs = expiryTime - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        const formattedDate = new Date(normalizedDate).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });

        if (diffHours <= 0) {
            return {
                text: 'Suspended',
                title: `Server expired on ${formattedDate}`,
                isInfinity: false,
                isExpired: true,
                isWarning: true,
            };
        }

        if (diffHours <= 24) {
            const h = Math.max(1, Math.round(diffHours));
            return {
                text: `${h}H`,
                title: `Suspends in ${h} hour${h > 1 ? 's' : ''} (${formattedDate})`,
                isInfinity: false,
                isExpired: false,
                isWarning: true,
            };
        }

        const days = Math.ceil(diffHours / 24);
        return {
            text: `${days}D`,
            title: `Suspends in ${days} day${days > 1 ? 's' : ''} (${formattedDate})`,
            isInfinity: false,
            isExpired: false,
            isWarning: false,
        };
    }, [liveExpireAt]);

    return (
        <div className={`inline-flex items-center gap-2 text-lg font-medium text-gray-300 select-none ${className}`}>
            <span title={formatted.title} className="inline-flex items-center gap-1.5">
                <span className="text-gray-400 font-normal">Uptime:</span>
                <span
                    className={
                        formatted.state === 'online'
                            ? 'text-gray-300 font-medium'
                            : formatted.state === 'starting'
                            ? 'text-amber-300 font-medium'
                            : 'text-gray-400 font-medium'
                    }
                >
                    {formatted.text}
                </span>
            </span>

            <span className="text-gray-500 mx-1">•</span>

            <span title={suspendFormatted.title} className="inline-flex items-center gap-1.5">
                <span className="text-gray-400 font-normal">Suspend:</span>
                <span
                    className={
                        suspendFormatted.isExpired
                            ? 'text-red-400 font-medium'
                            : suspendFormatted.isWarning
                            ? 'text-amber-300 font-medium'
                            : 'text-gray-300 font-medium'
                    }
                >
                    {suspendFormatted.text}
                </span>
            </span>
        </div>
    );
};

export default ServerUptime;
