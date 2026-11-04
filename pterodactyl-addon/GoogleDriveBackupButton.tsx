import React, { useState, useEffect } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import GoogleDriveBackupModal, { GoogleDriveIcon } from './GoogleDriveBackupModal';

interface Props {
    className?: string;
}

export default function GoogleDriveBackupButton({ className = '' }: Props) {
    let serverUuid = '';
    try {
        serverUuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
    } catch {
        serverUuid = '';
    }

    const [modalOpen, setModalOpen] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!serverUuid) return;

        http.get(`/api/client/servers/${serverUuid}/auto-backup/gdrive-auth`)
            .then(({ data }) => {
                setIsConnected(Boolean(data.is_connected));
            })
            .catch(() => {});
    }, [serverUuid]);

    if (!serverUuid) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setModalOpen(true)}
                className={`px-3.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/80 hover:border-slate-600 text-gray-200 hover:text-white text-xs font-medium inline-flex items-center gap-2 transition-all shadow-sm active:scale-95 ${className}`}
                title="Send server backup to Google Drive"
            >
                <GoogleDriveIcon className="w-4 h-4" />
                <span>Google Drive</span>
                {isConnected && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                        Linked
                    </span>
                )}
            </button>

            {modalOpen && (
                <GoogleDriveBackupModal
                    visible={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onStatusChange={(status) => setIsConnected(status)}
                />
            )}
        </>
    );
}
