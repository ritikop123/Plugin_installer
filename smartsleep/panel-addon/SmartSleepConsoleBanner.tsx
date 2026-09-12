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
        <div className="w-full mb-4 rounded-lg bg-neutral-800/80 border border-neutral-700/80 p-4 shadow-md transition-all duration-200">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                {/* Left Side: Status & Explanation */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-700/70 text-neutral-200 flex items-center justify-center flex-shrink-0">
                        <FontAwesomeIcon icon={faMoon} className="text-lg" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-neutral-700 text-neutral-200 border border-neutral-600">
                                Hibernating
                            </span>
                            <span className="text-xs text-neutral-400 font-medium">
                                SmartSleep Resource Saver
                            </span>
                        </div>
                        <p className="text-sm text-neutral-300 mt-1 leading-relaxed">
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
                        className="px-4 py-2 rounded font-medium text-sm transition-colors duration-150 flex items-center justify-center gap-2 w-full md:w-auto bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-500 text-neutral-100 border border-neutral-600 cursor-pointer disabled:opacity-50"
                    >
                        {waking ? (
                            <>
                                <FontAwesomeIcon icon={faSpinner} spin className="text-neutral-300" />
                                <span>Waking Server...</span>
                            </>
                        ) : wakeSuccess ? (
                            <>
                                <FontAwesomeIcon icon={faCheckCircle} className="text-neutral-300" />
                                <span>Starting...</span>
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon icon={faPlay} className="text-xs text-neutral-300" />
                                <span>Wake Server Now</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Metrics Row: Uptime, CPU (0%), RAM (0 MB) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-neutral-700/60">
                {/* Status Metric */}
                <div className="bg-neutral-900/50 rounded p-2.5 border border-neutral-800">
                    <div className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faInfoCircle} className="text-neutral-400" />
                        <span>State</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1">
                        Hibernating
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                        Ready to join
                    </div>
                </div>

                {/* Uptime Metric */}
                <div className="bg-neutral-900/50 rounded p-2.5 border border-neutral-800">
                    <div className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faClock} className="text-neutral-400" />
                        <span>Uptime</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1 font-mono">
                        {formattedUptime}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                        Continuous
                    </div>
                </div>

                {/* CPU Metric (0%) */}
                <div className="bg-neutral-900/50 rounded p-2.5 border border-neutral-800">
                    <div className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faMicrochip} className="text-neutral-400" />
                        <span>CPU Usage</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1">
                        0%
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                        {cpuLimit > 0 ? `0% / ${cpuLimit}% (Idle)` : '0% (Idle)'}
                    </div>
                </div>

                {/* RAM Metric (0 MB) */}
                <div className="bg-neutral-900/50 rounded p-2.5 border border-neutral-800">
                    <div className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faMemory} className="text-neutral-400" />
                        <span>Memory Usage</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1">
                        0 MB
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                        {memoryLimit > 0 ? `0 / ${memoryLimit} MB (Freed)` : '0 MB (Freed)'}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmartSleepConsoleBanner;
