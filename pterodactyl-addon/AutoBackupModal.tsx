import React, { useState, useEffect } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faClock,
    faCheckCircle,
    faTimes,
    faSpinner,
    faExclamationTriangle,
    faPlay,
    faTrashAlt,
    faShieldAlt,
    faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
    onScheduleSaved?: (time: string | null) => void;
}

interface BackupSettings {
    is_enabled: boolean;
    backup_time: string; // HH:mm format, e.g. "03:00"
    current_server_time: string;
    server_timezone: string;
    last_run_at: string | null;
    last_backup_name: string | null;
    retention_count: number;
}

export default function AutoBackupModal({ visible, onClose, onScheduleSaved }: Props) {
    let serverUuid = '';
    try {
        serverUuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
    } catch {
        serverUuid = '';
    }

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [runningNow, setRunningNow] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [enabled, setEnabled] = useState(false);
    const [backupTime, setBackupTime] = useState('03:00');
    const [serverTime, setServerTime] = useState('');
    const [serverTimezone, setServerTimezone] = useState('UTC');
    const [lastRun, setLastRun] = useState<string | null>(null);
    const [lastBackupName, setLastBackupName] = useState<string | null>(null);

    // Fetch existing settings
    const loadSettings = () => {
        if (!serverUuid) return;
        setLoading(true);
        setErrorMsg(null);

        http.get(`/api/client/servers/${serverUuid}/auto-backup`)
            .then(({ data }) => {
                setEnabled(Boolean(data.is_enabled));
                setBackupTime(data.backup_time || '03:00');
                setServerTime(data.current_server_time || '');
                setServerTimezone(data.server_timezone || 'UTC');
                setLastRun(data.last_run_at || null);
                setLastBackupName(data.last_backup_name || null);
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to load auto-backup schedule.');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (visible) {
            setSuccessMsg(null);
            setErrorMsg(null);
            loadSettings();
        }
    }, [visible, serverUuid]);

    // Save schedule settings
    const handleSave = () => {
        if (!serverUuid) return;
        setSaving(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        http.post(`/api/client/servers/${serverUuid}/auto-backup`, {
            is_enabled: enabled,
            backup_time: backupTime,
        })
            .then(({ data }) => {
                setSuccessMsg(data.message || 'Automated backup schedule saved successfully!');
                if (onScheduleSaved) {
                    onScheduleSaved(enabled ? backupTime : null);
                }
                // Dispatch event so header badge updates immediately
                window.dispatchEvent(
                    new CustomEvent('server:auto_backup_updated', {
                        detail: {
                            is_enabled: enabled,
                            backup_time: enabled ? backupTime : null,
                        },
                    })
                );
                setTimeout(() => {
                    onClose();
                }, 1200);
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to update automated backup schedule.');
            })
            .finally(() => setSaving(false));
    };

    // Trigger immediate auto-backup run
    const handleRunNow = () => {
        if (!serverUuid) return;
        if (!confirm('Run automated backup right now? This will create a fresh automated backup and delete the old automated backup.')) {
            return;
        }

        setRunningNow(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        http.post(`/api/client/servers/${serverUuid}/auto-backup/run`)
            .then(({ data }) => {
                setSuccessMsg(data.message || 'Automated backup initiated successfully! Check Backups list in a moment.');
                setLastRun(new Date().toISOString());
                setLastBackupName(data.backup_name || null);
                // Dispatch window event so backup list refreshes
                window.dispatchEvent(new CustomEvent('server:backup_created'));
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to start automated backup.');
            })
            .finally(() => setRunningNow(false));
    };

    if (!visible) return null;

    // Generate 24 hourly options
    const hours = Array.from({ length: 24 }, (_, i) => {
        const val = i.toString().padStart(2, '0') + ':00';
        const period = i >= 12 ? 'PM' : 'AM';
        const displayHour = i % 12 === 0 ? 12 : i % 12;
        return {
            value: val,
            label: `${val} (${displayHour}:00 ${period})`,
        };
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden text-gray-200">
                {/* Header */}
                <div className="bg-[#1e293b]/80 px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-lg">
                            <FontAwesomeIcon icon={faClock} />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-base">
                                Automated Backup Schedule
                            </h3>
                            <p className="text-gray-400 text-xs">
                                Automatically capture daily server backups and auto-purge old snapshots
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    >
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    {loading && (
                        <div className="py-8 flex flex-col items-center justify-center space-y-2">
                            <FontAwesomeIcon icon={faSpinner} spin className="text-cyan-400 text-2xl" />
                            <p className="text-sm text-gray-400">Loading backup schedule settings...</p>
                        </div>
                    )}

                    {errorMsg && (
                        <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 mt-0.5" />
                            <div>{errorMsg}</div>
                        </div>
                    )}

                    {successMsg && (
                        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
                            <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-400 mt-0.5" />
                            <div>{successMsg}</div>
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* Enable/Disable Toggle */}
                            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                        <span>Daily Automated Backup</span>
                                        {enabled ? (
                                            <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                                                Active
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 text-[10px] bg-gray-500/20 text-gray-400 rounded-full font-semibold border border-gray-600/30">
                                                Disabled
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Run an automated backup every 24 hours at the selected scheduled time.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={enabled}
                                        onChange={(e) => setEnabled(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600" />
                                </label>
                            </div>

                            {/* Scheduled Time of Day */}
                            <div className={`space-y-2 transition-opacity ${enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                                <label className="block text-xs font-medium text-gray-300">
                                    Scheduled Time (Daily)
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <select
                                        value={backupTime}
                                        onChange={(e) => setBackupTime(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-gray-100 focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                                    >
                                        {hours.map((h) => (
                                            <option key={h.value} value={h.value}>
                                                {h.label}
                                            </option>
                                        ))}
                                    </select>

                                    <div className="px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                                        <span className="text-gray-400">Current Server Time:</span>
                                        <span className="text-cyan-300 font-mono font-medium">
                                            {serverTime || 'Checking...'} {serverTimezone}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Explanation Card */}
                            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                                <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold">
                                    <FontAwesomeIcon icon={faInfoCircle} />
                                    <span>How Automated Backups Work</span>
                                </div>
                                <ul className="text-xs text-gray-300 space-y-1.5 list-disc list-inside leading-relaxed">
                                    <li>
                                        <strong>Automatic Execution:</strong> Takes a full server backup daily at{' '}
                                        <span className="text-cyan-300 font-medium">{backupTime} {serverTimezone}</span>.
                                    </li>
                                    <li>
                                        <strong>Auto-Purge Old Backups:</strong> Everyday when the new automated backup is created, the system deletes the previous automated backup to keep disk space free and stay within your server backup quota.
                                    </li>
                                    <li>
                                        <strong>Automated Tag:</strong> Backups created by this schedule are clearly labeled with an <span className="text-cyan-300 font-semibold">[Automated]</span> badge.
                                    </li>
                                </ul>
                            </div>

                            {/* Status info */}
                            {(lastRun || lastBackupName) && (
                                <div className="px-4 py-3 rounded-xl bg-slate-800/30 border border-slate-800 flex items-center justify-between text-xs">
                                    <span className="text-gray-400">Last Automated Backup:</span>
                                    <span className="text-gray-200 font-mono">
                                        {lastRun ? new Date(lastRun).toLocaleString() : 'None recorded'}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="bg-[#1e293b]/60 px-6 py-4 border-t border-slate-700/80 flex items-center justify-between">
                    <div>
                        <button
                            type="button"
                            onClick={handleRunNow}
                            disabled={runningNow || loading}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-gray-300 hover:text-white flex items-center gap-2 transition-all disabled:opacity-50"
                            title="Trigger an automated backup immediately to test schedule"
                        >
                            <FontAwesomeIcon icon={runningNow ? faSpinner : faPlay} spin={runningNow} className="text-cyan-400" />
                            <span>{runningNow ? 'Taking Backup...' : 'Take Auto Backup Now'}</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-xs text-gray-300 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-all disabled:opacity-50"
                        >
                            {saving && <FontAwesomeIcon icon={faSpinner} spin />}
                            <span>Save Schedule</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
