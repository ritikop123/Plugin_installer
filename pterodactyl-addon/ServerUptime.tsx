import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

interface Props {
    uptime?: number | null;
    status?: string | null;
    stats?: any;
    className?: string;
}

const ServerUptime: React.FC<Props> = ({ uptime: propUptime, status: propStatus, stats, className = '' }) => {
    const rawUptime = propUptime !== undefined ? propUptime : (stats?.uptime ?? stats?.resources?.uptime);
    const rawStatus = propStatus !== undefined ? propStatus : (stats?.status ?? stats?.state);

    const formatted = useMemo(() => {
        const isRunning = rawStatus === 'running';

        if (!isRunning || !rawUptime || typeof rawUptime !== 'number' || rawUptime <= 0) {
            if (rawStatus === 'starting') {
                return { text: 'Starting...', title: 'Server is starting up', isOnline: false };
            }
            if (rawStatus === 'stopping') {
                return { text: 'Stopping...', title: 'Server is stopping', isOnline: false };
            }
            return { text: 'Offline', title: 'Server is offline', isOnline: false };
        }

        const now = Date.now();
        let seconds = 0;

        if (rawUptime > 1000000000000) {
            // Milliseconds epoch timestamp (e.g. started_at)
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
            return { text: '< 1m', title: 'Server started less than a minute ago', isOnline: true };
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

        return { text, title: fullTitle, isOnline: true };
    }, [rawUptime, rawStatus]);

    return (
        <div
            title={formatted.title}
            className={`flex items-center gap-1.5 text-xs text-gray-400 select-none ${className}`}
        >
            <FontAwesomeIcon icon={faClock} className={`text-xs ${formatted.isOnline ? 'text-gray-400' : 'text-gray-500'}`} />
            <span className={formatted.isOnline ? 'text-gray-300' : 'text-gray-500'}>{formatted.text}</span>
        </div>
    );
};

export default ServerUptime;
