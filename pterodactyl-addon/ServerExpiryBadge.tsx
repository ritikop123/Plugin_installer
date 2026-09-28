import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';

interface Props {
    expireAt?: string | null;
    className?: string;
}

const ServerExpiryBadge: React.FC<Props> = ({ expireAt, className = '' }) => {
    if (!expireAt || expireAt === 'N/A' || expireAt === 'null' || expireAt === 'undefined') return null;

    const badge = useMemo(() => {
        try {
            const expiryTime = new Date(expireAt).getTime();
            if (isNaN(expiryTime)) return null;

            const now = Date.now();
            const diffMs = expiryTime - now;
            const diffHours = diffMs / (1000 * 60 * 60);

            const formattedDate = new Date(expireAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });

            if (diffHours <= 0) {
                return {
                    text: 'Expired',
                    classes: 'bg-red-500/15 text-red-300 border-red-500/30',
                    iconClass: 'text-red-400',
                    title: `Server expired on ${formattedDate}`,
                };
            }

            if (diffHours <= 24) {
                const h = Math.max(1, Math.round(diffHours));
                return {
                    text: `${h}H`,
                    classes: 'bg-red-500/15 text-red-300 border-red-500/30',
                    iconClass: 'text-red-400',
                    title: `Suspends in ${h} hour${h > 1 ? 's' : ''} (${formattedDate})`,
                };
            }

            const days = Math.ceil(diffHours / 24);
            if (days <= 3) {
                return {
                    text: `${days}D`,
                    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                    iconClass: 'text-amber-400',
                    title: `Expires in ${days} day${days > 1 ? 's' : ''} (${formattedDate})`,
                };
            }

            return {
                text: `${days}D`,
                classes: 'bg-white/10 text-gray-200 border-white/15 hover:border-white/25',
                iconClass: 'text-arix',
                title: `Expires in ${days} days (${formattedDate})`,
            };
        } catch {
            return null;
        }
    }, [expireAt]);

    if (!badge) return null;

    return (
        <span
            title={badge.title}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-component text-xs font-medium border backdrop-blur-md transition-colors select-none ${badge.classes} ${className}`}
        >
            <FontAwesomeIcon icon={faClock} className={`text-[10px] ${badge.iconClass}`} />
            <span>{badge.text}</span>
        </span>
    );
};

export default ServerExpiryBadge;
