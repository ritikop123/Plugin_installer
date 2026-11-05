import React, { useState, useEffect } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCloudUploadAlt,
    faCheckCircle,
    faTimes,
    faSpinner,
    faExclamationTriangle,
    faExternalLinkAlt,
    faUnlink,
    faHdd,
    faFolder,
    faSync,
} from '@fortawesome/free-solid-svg-icons';

interface Props {
    visible: boolean;
    onClose: () => void;
    onStatusChange?: (connected: boolean) => void;
}

// Clean official Google Drive SVG Icon
export const GoogleDriveIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg viewBox="0 0 87.3 78" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA"/>
        <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5L43.65 25z" fill="#00AC47"/>
        <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 5.4-9.35c.8-1.4 1.2-2.95 1.2-4.5H57.55l7.9 13.7 8.1 6.2z" fill="#EA4335"/>
        <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.4-4.5 1.2L43.65 25z" fill="#00832D"/>
        <path d="M57.55 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.4 4.5-1.2L57.55 53z" fill="#2684FC"/>
        <path d="M73.55 27.75L60.05 4.5C59.25 3.1 58.1 2 56.75 1.2L43.65 25l13.9 24h27.5c0-1.55-.4-3.1-1.2-4.5l-10.3-16.75z" fill="#FFBA00"/>
    </svg>
);

export default function GoogleDriveBackupModal({ visible, onClose, onStatusChange }: Props) {
    let serverUuid = '';
    try {
        serverUuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
    } catch {
        serverUuid = '';
    }

    const [loading, setLoading] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatusText, setUploadStatusText] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const [connected, setConnected] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [driveFolderName, setDriveFolderName] = useState<string>('Pterodactyl-Backups');
    const [autoSyncToGdrive, setAutoSyncToGdrive] = useState(false);
    const [quotaText, setQuotaText] = useState<string | null>(null);
    const [authCodeInput, setAuthCodeInput] = useState('');
    const [showCodeInput, setShowCodeInput] = useState(false);

    // Fetch Google Drive status
    const loadGdriveStatus = () => {
        if (!serverUuid) return;
        setLoading(true);
        setErrorMsg(null);

        http.get(`/api/client/servers/${serverUuid}/auto-backup/gdrive-auth`)
            .then(({ data }) => {
                setConnected(Boolean(data.is_connected));
                setUserEmail(data.email || null);
                setDriveFolderName(data.folder_name || 'Pterodactyl-Backups');
                setAutoSyncToGdrive(Boolean(data.auto_sync));
                setQuotaText(data.quota_summary || null);
                if (onStatusChange) {
                    onStatusChange(Boolean(data.is_connected));
                }
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to check Google Drive link.');
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (visible) {
            setErrorMsg(null);
            setSuccessMsg(null);
            setShowCodeInput(false);
            setUploadStatusText('');
            loadGdriveStatus();
        }
    }, [visible, serverUuid]);

    // Handle OAuth Authorization Click
    const handleConnectClick = () => {
        if (!serverUuid) return;
        setConnecting(true);
        setErrorMsg(null);

        http.get(`/api/client/servers/${serverUuid}/auto-backup/gdrive-auth?get_url=1`)
            .then(({ data }) => {
                if (data.auth_url) {
                    // Open Google OAuth window
                    const authWindow = window.open(
                        data.auth_url,
                        'GoogleDriveAuth',
                        'width=600,height=700,status=no,toolbar=no,menubar=no'
                    );

                    setShowCodeInput(true);
                    setSuccessMsg('Authorization window opened. Sign in and grant access to your Google Drive, then paste authorization code below or confirm.');

                    // Listen for message from popup if redirect handles postMessage
                    const messageListener = (event: MessageEvent) => {
                        if (event.data?.type === 'GDRIVE_AUTH_SUCCESS') {
                            setConnected(true);
                            setUserEmail(event.data.email || null);
                            setShowCodeInput(false);
                            setSuccessMsg('Google Drive connected successfully!');
                            if (authWindow) authWindow.close();
                            window.removeEventListener('message', messageListener);
                            loadGdriveStatus();
                        }
                    };
                    window.addEventListener('message', messageListener);
                } else {
                    setShowCodeInput(true);
                    setSuccessMsg('Enter your Google Drive authorization code or access token below to link your storage.');
                }
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to start Google Drive authorization.');
            })
            .finally(() => setConnecting(false));
    };

    // Submit Authorization Code manually if needed
    const handleCodeSubmit = () => {
        if (!authCodeInput.trim() || !serverUuid) return;
        setConnecting(true);
        setErrorMsg(null);

        http.post(`/api/client/servers/${serverUuid}/auto-backup/gdrive-connect`, {
            auth_code: authCodeInput.trim(),
        })
            .then(({ data }) => {
                setConnected(true);
                setUserEmail(data.email || null);
                setShowCodeInput(false);
                setAuthCodeInput('');
                setSuccessMsg('Google Drive connected successfully!');
                loadGdriveStatus();
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Invalid Google authorization code.');
            })
            .finally(() => setConnecting(false));
    };

    // Disconnect Google Drive
    const handleDisconnect = () => {
        if (!serverUuid || !confirm('Disconnect your Google Drive account? Cloud backup synchronization will stop.')) {
            return;
        }

        setLoading(true);
        http.post(`/api/client/servers/${serverUuid}/auto-backup/gdrive-disconnect`)
            .then(() => {
                setConnected(false);
                setUserEmail(null);
                setSuccessMsg('Google Drive disconnected.');
                if (onStatusChange) {
                    onStatusChange(false);
                }
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to disconnect Google Drive.');
            })
            .finally(() => setLoading(false));
    };

    // Save Auto-Sync setting
    const handleToggleAutoSync = (checked: boolean) => {
        setAutoSyncToGdrive(checked);
        if (!serverUuid) return;

        http.post(`/api/client/servers/${serverUuid}/auto-backup/gdrive-connect`, {
            auto_sync: checked,
        }).catch(() => {});
    };

    // Upload latest backup to Google Drive
    const handleUploadToDrive = () => {
        if (!serverUuid) return;
        setUploading(true);
        setUploadProgress(10);
        setUploadStatusText('Preparing server backup for Google Drive transfer...');
        setErrorMsg(null);
        setSuccessMsg(null);

        http.post(`/api/client/servers/${serverUuid}/auto-backup/gdrive-upload`)
            .then(({ data }) => {
                setUploadProgress(100);
                setUploadStatusText('Backup successfully transferred to Google Drive!');
                setSuccessMsg(data.message || 'Server backup successfully sent to Google Drive!');
            })
            .catch((err) => {
                setErrorMsg(httpErrorToHuman(err) || 'Failed to upload backup to Google Drive.');
                setUploadStatusText('');
            })
            .finally(() => setUploading(false));
    };

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden text-gray-200">
                {/* Header */}
                <div className="bg-[#1e293b]/80 px-6 py-4 border-b border-slate-700/80 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                            <GoogleDriveIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-base flex items-center gap-2">
                                <span>Google Drive Cloud Backup</span>
                                {connected && (
                                    <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 rounded-full font-semibold border border-emerald-500/30">
                                        Connected
                                    </span>
                                )}
                            </h3>
                            <p className="text-gray-400 text-xs">
                                Safeguard server backups directly to your personal Google Drive storage
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
                <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                    {loading && (
                        <div className="py-8 flex flex-col items-center justify-center space-y-2">
                            <FontAwesomeIcon icon={faSpinner} spin className="text-cyan-400 text-2xl" />
                            <p className="text-sm text-gray-400">Connecting with Google Drive...</p>
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

                    {!loading && !connected && (
                        <div className="space-y-4">
                            <div className="p-5 rounded-xl bg-slate-800/40 border border-slate-700/60 text-center space-y-3">
                                <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center">
                                    <GoogleDriveIcon className="w-8 h-8" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-white">
                                        Link your Google Drive
                                    </h4>
                                    <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 leading-relaxed">
                                        Authorize access to securely store your server archives, world files, and configs directly on Google Drive.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleConnectClick}
                                    disabled={connecting}
                                    className="px-5 py-2.5 rounded-xl bg-white hover:bg-gray-100 text-gray-900 font-semibold text-xs inline-flex items-center gap-2.5 shadow-lg transition-all active:scale-95"
                                >
                                    <GoogleDriveIcon className="w-4 h-4" />
                                    <span>{connecting ? 'Requesting Access...' : 'Sign in with Google Drive'}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setShowCodeInput(!showCodeInput)}
                                    className="text-[11px] text-gray-400 hover:text-cyan-400 underline block mx-auto pt-1 transition-colors cursor-pointer"
                                >
                                    {showCodeInput ? 'Hide manual token input' : 'Or connect manually with authorization code / token'}
                                </button>
                            </div>

                            {showCodeInput && (
                                <div className="p-4 rounded-xl bg-slate-900 border border-slate-700 space-y-3 text-left">
                                    <label className="block text-xs font-medium text-gray-300">
                                        Enter Authorization Code / Access Token:
                                    </label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={authCodeInput}
                                            onChange={(e) => setAuthCodeInput(e.target.value)}
                                            placeholder="Paste Google Authorization Code or Access Token here..."
                                            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCodeSubmit}
                                            disabled={!authCodeInput.trim() || connecting}
                                            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                                        >
                                            Verify & Link
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-gray-400 leading-relaxed">
                                        Paste your OAuth authorization code, or generate a temporary access token with Drive scope from <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Google OAuth Playground</a> (Select Drive API v3) to link directly.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && connected && (
                        <div className="space-y-4">
                            {/* Connected Account Card */}
                            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center">
                                        <GoogleDriveIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-400">Connected Account</div>
                                        <div className="text-sm font-semibold text-white">
                                            {userEmail || 'Google Drive Authorized'}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    className="px-3 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-xs flex items-center gap-1.5 transition-all"
                                    title="Unlink this Google Drive account"
                                >
                                    <FontAwesomeIcon icon={faUnlink} className="text-xs" />
                                    <span>Disconnect</span>
                                </button>
                            </div>

                            {/* Storage Folder */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <FontAwesomeIcon icon={faFolder} className="text-amber-400" />
                                        <span>Target Folder:</span>
                                    </div>
                                    <div className="font-mono text-cyan-300 truncate">
                                        /{driveFolderName}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                                    <div className="flex items-center gap-1.5 text-gray-400">
                                        <FontAwesomeIcon icon={faHdd} className="text-cyan-400" />
                                        <span>Storage Status:</span>
                                    </div>
                                    <div className="text-gray-200">
                                        {quotaText || 'Active & Ready'}
                                    </div>
                                </div>
                            </div>

                            {/* Auto Sync Toggle */}
                            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                                        <span>Auto-Sync Daily Backups to Google Drive</span>
                                    </h4>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                        Whenever an automated daily backup completes, automatically mirror it to Google Drive.
                                    </p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={autoSyncToGdrive}
                                        onChange={(e) => handleToggleAutoSync(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                                </label>
                            </div>

                            {/* Upload Status text / progress */}
                            {uploadStatusText && (
                                <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-xs space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-2">
                                            {uploading && <FontAwesomeIcon icon={faSpinner} spin />}
                                            {uploadStatusText}
                                        </span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-cyan-500 h-1.5 rounded-full transition-all duration-300"
                                            style={{ width: `${uploadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="bg-[#1e293b]/60 px-6 py-4 border-t border-slate-700/80 flex items-center justify-between">
                    <div>
                        {connected && (
                            <button
                                type="button"
                                onClick={handleUploadToDrive}
                                disabled={uploading || loading}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                            >
                                <FontAwesomeIcon icon={uploading ? faSpinner : faCloudUploadAlt} spin={uploading} />
                                <span>{uploading ? 'Sending to Drive...' : 'Send Server Data to Google Drive'}</span>
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-xs text-gray-300 hover:text-white transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
