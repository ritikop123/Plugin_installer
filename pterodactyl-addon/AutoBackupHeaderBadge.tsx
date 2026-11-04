import React, { useState, useEffect } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock, faCalendarCheck } from '@fortawesome/free-solid-svg-icons';
import AutoBackupModal from './AutoBackupModal';

interface Props {
    className?: string;
}

export default function AutoBackupHeaderBadge({ className = '' }: Props) {
    let serverUuid = '';
    try {
        serverUuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
    } catch {
        serverUuid = '';
    }

    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledTime, setScheduledTime] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        if (!serverUuid) return;

        http.get(`/api/client/servers/${serverUuid}/auto-backup`)
            .then(({ data }) => {
                const active = Boolean(data.is_enabled);
                setIsScheduled(active);
                setScheduledTime(active ? data.backup_time || '03:00' : null);
            })
            .catch(() => {});

        const handleUpdate = (e: any) => {
            if (e.detail) {
                setIsScheduled(Boolean(e.detail.is_enabled));
                setScheduledTime(e.detail.backup_time || null);
            }
        };

        window.addEventListener('server:auto_backup_updated', handleUpdate);
        return () => window.removeEventListener('server:auto_backup_updated', handleUpdate);
    }, [serverUuid]);

    if (!serverUuid) return null;

    return (
        <>
            <div className={`inline-flex items-center gap-1.5 select-none ${className}`}>
                <span className="text-gray-500 mx-1">•</span>
                {isScheduled ? (
                    <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        title={`Daily automated backup scheduled at ${scheduledTime} UTC. Click to modify schedule.`}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 hover:border-cyan-400/60 text-cyan-300 hover:text-cyan-200 transition-all font-medium group cursor-pointer shadow-sm"
                    >
                        <FontAwesomeIcon
                            icon={faCalendarCheck}
                            className="text-cyan-400 group-hover:scale-110 transition-transform"
                        />
                        <span className="text-gray-300 font-normal">Auto Backup:</span>
                        <span className="font-semibold text-cyan-300">{scheduledTime}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        title="Click to configure daily automated backup schedule"
                        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 text-gray-400 hover:text-gray-200 transition-all cursor-pointer font-medium"
                    >
                        <FontAwesomeIcon icon={faClock} className="text-gray-500 text-xs" />
                        <span>Auto Backup: Off</span>
                    </button>
                )}
            </div>

            {modalOpen && (
                <AutoBackupModal
                    visible={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onScheduleSaved={(time) => {
                        setIsScheduled(Boolean(time));
                        setScheduledTime(time);
                    }}
                />
            )}
        </>
    );
}
