import React, { useState, useEffect } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClock } from '@fortawesome/free-solid-svg-icons';
import AutoBackupModal from './AutoBackupModal';

interface Props {
    className?: string;
}

export default function AutoBackupButton({ className = '' }: Props) {
    let serverUuid = '';
    try {
        serverUuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
    } catch {
        serverUuid = '';
    }

    const [modalOpen, setModalOpen] = useState(false);
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledTime, setScheduledTime] = useState<string | null>(null);

    // Fetch initial status
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
            <button
                type="button"
                onClick={() => setModalOpen(true)}
                className={`px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700 text-gray-200 hover:text-white text-sm font-medium inline-flex items-center gap-2 transition-all shadow-sm active:scale-95 ${className}`}
                title={
                    isScheduled
                        ? `Daily auto backup scheduled at ${scheduledTime}`
                        : 'Configure daily automated backup'
                }
            >
                <FontAwesomeIcon
                    icon={faClock}
                    className={isScheduled ? 'text-cyan-400' : 'text-gray-400'}
                />
                <span>Automated backup</span>
                {isScheduled && (
                    <span
                        className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-emerald-400/20"
                        title="Automated backup active"
                    />
                )}
            </button>

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
