import React, { useState, useEffect, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMoon,
    faPlay,
    faClock,
    faMicrochip,
    faMemory,
    faSpinner,
    faCheckCircle,
    faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';

interface SmartSleepInfo {
    is_hibernating: boolean;
    virtual_uptime: number;
    settings?: {
        enabled: boolean;
        timeout: number;
    };
    server?: {
        memory_limit: number;
        cpu_limit: number;
        smartsleep_enabled: boolean;
    };
}

const SmartSleepConsoleBanner: React.FC = () => {
    const server = ServerContext.useStoreState((state) => state.server.data);
    const uuid = server?.uuid;
    const memoryLimit = server?.limits?.memory || 0;
    const cpuLimit = server?.limits?.cpu || 0;

    // Detect live status from ServerContext store
    const storeStatus = ServerContext.useStoreState((state) => {
        if ((state as any).status?.value) return (state as any).status.value;
        if ((state as any).server?.data?.status) return (state as any).server.data.status;
        return null;
    });

    const [info, setInfo] = useState<SmartSleepInfo | null>(null);
    const [waking, setWaking] = useState(false);
    const [wakeSuccess, setWakeSuccess] = useState(false);
    const [uptimeOffset, setUptimeOffset] = useState<number>(0);

    // Fetch SmartSleep status for this server
    const fetchStatus = () => {
        if (!uuid) return;
        http.get(`/api/client/servers/${uuid}/smartsleep`)
            .then(({ data }) => {
                setInfo(data);
                if (data.virtual_uptime) {
                    setUptimeOffset(data.virtual_uptime);
                }
            })
            .catch(() => {});
    };

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, [uuid]);

    // Live continuous uptime counter (increments every 1 second)
    useEffect(() => {
        const timer = setInterval(() => {
            setUptimeOffset((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Format seconds into readable continuous uptime string (e.g. "3d 4h 12m 34s")
    const formattedUptime = useMemo(() => {
        if (!uptimeOffset || uptimeOffset <= 0) return '0m 0s';
        const days = Math.floor(uptimeOffset / 86400);
        const hours = Math.floor((uptimeOffset % 86400) / 3600);
        const minutes = Math.floor((uptimeOffset % 3600) / 60);
        const seconds = Math.floor(uptimeOffset % 60);

        const parts: string[] = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        parts.push(`${minutes}m`);
        parts.push(`${seconds}s`);
        return parts.join(' ');
    }, [uptimeOffset]);

    // Check if server is currently in hibernation:
    // Status is 'offline' and SmartSleep is enabled for this server
    const isSleeping = useMemo(() => {
        const isOffline = storeStatus === 'offline' || storeStatus === null;
        if (info?.is_hibernating !== undefined) {
            return info.is_hibernating && isOffline;
        }
        const enabled = info?.settings?.enabled ?? info?.server?.smartsleep_enabled ?? true;
        return isOffline && enabled;
    }, [storeStatus, info]);

    // DOM MutationObserver: transforms any "Offline" badge on the console page to "🌙 Hibernating"
    useEffect(() => {
        if (!isSleeping) return;

        const updateBadges = () => {
            document.querySelectorAll('span, div, p').forEach((el) => {
                const text = el.textContent?.trim();
                if (text === 'Offline' && el.children.length === 0 && (el.textContent?.length || 0) < 15) {
                    el.textContent = '🌙 Hibernating';
                    (el as HTMLElement).style.backgroundColor = 'rgba(139, 92, 246, 0.2)';
                    (el as HTMLElement).style.color = '#c4b5fd';
                    (el as HTMLElement).style.borderColor = 'rgba(139, 92, 246, 0.4)';
                }
            });
        };

        updateBadges();
        const observer = new MutationObserver(updateBadges);
        observer.observe(document.body, { childList: true, subtree: true });

        return () => observer.disconnect();
    }, [isSleeping]);

    const handleWake = () => {
        if (!uuid || waking) return;
        setWaking(true);

        http.post(`/api/client/servers/${uuid}/smartsleep/wake`)
            .then(() => {
                setWakeSuccess(true);
                setTimeout(() => {
                    setWaking(false);
                    fetchStatus();
                }, 4000);
            })
            .catch(() => {
                // Fallback to power start signal
                http.post(`/api/client/servers/${uuid}/power`, { signal: 'start' })
                    .finally(() => {
                        setWakeSuccess(true);
                        setTimeout(() => {
                            setWaking(false);
                            fetchStatus();
                        }, 4000);
                    });
            });
    };

    if (!isSleeping) {
        return null;
    }

    return (
        <div
            className="w-full mb-4 rounded-xl border p-4 shadow-xl transition-all duration-300"
            style={{
                background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.7) 0%, rgba(15, 23, 42, 0.85) 50%, rgba(17, 24, 39, 0.9) 100%)',
                borderColor: 'rgba(139, 92, 246, 0.35)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 32px 0 rgba(139, 92, 246, 0.15)',
            }}
        >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                {/* Left Side: Status & Explanation */}
                <div className="flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg"
                        style={{
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                            color: '#ffffff',
                        }}
                    >
                        <FontAwesomeIcon icon={faMoon} className="text-xl animate-pulse" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span
                                className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border shadow-sm"
                                style={{
                                    background: 'rgba(139, 92, 246, 0.25)',
                                    color: '#ddd6fe',
                                    borderColor: 'rgba(167, 139, 250, 0.4)',
                                }}
                            >
                                ● Hibernating
                            </span>
                            <span className="text-xs text-neutral-400 font-medium">
                                SmartSleep™ Resource Saver
                            </span>
                        </div>
                        <p className="text-sm text-neutral-200 mt-1 font-medium leading-relaxed">
                            Server is in hibernation mode saving 100% RAM & CPU. Connect to Minecraft or click Wake below.
                        </p>
                    </div>
                </div>

                {/* Right Side: Wake Button */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    <button
                        type="button"
                        onClick={handleWake}
                        disabled={waking}
                        className="px-5 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 shadow-lg flex items-center justify-center gap-2 w-full md:w-auto"
                        style={{
                            background: wakeSuccess
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                            color: '#ffffff',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            boxShadow: '0 4px 15px rgba(139, 92, 246, 0.35)',
                        }}
                    >
                        {waking ? (
                            <>
                                <FontAwesomeIcon icon={faSpinner} spin />
                                <span>Waking Server...</span>
                            </>
                        ) : wakeSuccess ? (
                            <>
                                <FontAwesomeIcon icon={faCheckCircle} />
                                <span>Signal Sent! Starting...</span>
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon icon={faPlay} className="text-xs" />
                                <span>Wake Server Now</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Metrics Row: Uptime, CPU (0%), RAM (0 MB) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-purple-500/20">
                {/* Status Metric */}
                <div className="bg-slate-900/40 rounded-lg p-2.5 border border-purple-500/15">
                    <div className="text-xs text-purple-300/80 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faInfoCircle} className="text-purple-400" />
                        <span>System State</span>
                    </div>
                    <div className="text-sm font-bold text-purple-200 mt-1">
                        Hibernating
                    </div>
                    <div className="text-[11px] text-purple-300/60 mt-0.5">
                        Ready to join
                    </div>
                </div>

                {/* Uptime Metric */}
                <div className="bg-slate-900/40 rounded-lg p-2.5 border border-purple-500/15">
                    <div className="text-xs text-purple-300/80 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faClock} className="text-cyan-400" />
                        <span>Uptime</span>
                    </div>
                    <div className="text-sm font-bold text-cyan-200 mt-1 font-mono">
                        {formattedUptime}
                    </div>
                    <div className="text-[11px] text-cyan-300/60 mt-0.5">
                        Ticking continuous
                    </div>
                </div>

                {/* CPU Metric (0%) */}
                <div className="bg-slate-900/40 rounded-lg p-2.5 border border-purple-500/15">
                    <div className="text-xs text-purple-300/80 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faMicrochip} className="text-emerald-400" />
                        <span>CPU Usage</span>
                    </div>
                    <div className="text-sm font-bold text-emerald-300 mt-1">
                        0%
                    </div>
                    <div className="text-[11px] text-emerald-300/60 mt-0.5">
                        {cpuLimit > 0 ? `0% / ${cpuLimit}% (Idle)` : '0% (Idle)'}
                    </div>
                </div>

                {/* RAM Metric (0 MB) */}
                <div className="bg-slate-900/40 rounded-lg p-2.5 border border-purple-500/15">
                    <div className="text-xs text-purple-300/80 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faMemory} className="text-blue-400" />
                        <span>Memory Usage</span>
                    </div>
                    <div className="text-sm font-bold text-blue-300 mt-1">
                        0 MB
                    </div>
                    <div className="text-[11px] text-blue-300/60 mt-0.5">
                        {memoryLimit > 0 ? `0 / ${memoryLimit} MB (Freed)` : '0 MB (Freed)'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartSleepConsoleBanner;
