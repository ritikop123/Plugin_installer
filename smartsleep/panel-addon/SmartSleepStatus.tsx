import React, { useState, useEffect, useRef } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faMoon,
    faClock,
    faMicrochip,
    faMemory,
} from '@fortawesome/free-solid-svg-icons';

interface SmartSleepResponse {
    success: boolean;
    is_hibernating: boolean;
    virtual_uptime?: number;
    server?: {
        name?: string;
        cpu_limit?: number;
        memory_limit?: number;
    };
}

const formatSeconds = (totalSeconds: number): string => {
    if (totalSeconds <= 0) return '0s';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.slice(0, 3).join(' ');
};

const SmartSleepStatus: React.FC = () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const status = ServerContext.useStoreState((state) => state.status.value);
    const memoryLimit = ServerContext.useStoreState((state) => state.server.data?.memory || 0);
    const cpuLimit = ServerContext.useStoreState((state) => state.server.data?.cpu || 0);

    const [isHibernating, setIsHibernating] = useState<boolean>(false);
    const [uptime, setUptime] = useState<number>(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch hibernation status when server is offline
    useEffect(() => {
        if (!uuid) return;

        if (status !== 'offline') {
            setIsHibernating(false);
            return;
        }

        let isMounted = true;

        const checkStatus = () => {
            http.get<SmartSleepResponse>(`/api/client/servers/${uuid}/smartsleep`)
                .then((res) => {
                    if (!isMounted) return;
                    if (res.data?.is_hibernating) {
                        setIsHibernating(true);
                        if (res.data.virtual_uptime && res.data.virtual_uptime > 0) {
                            setUptime((prev) => (prev > 0 ? prev : res.data.virtual_uptime!));
                        }
                    } else {
                        setIsHibernating(false);
                    }
                })
                .catch(() => {
                    // Fallback to offline
                });
        };

        checkStatus();
        const pollInterval = setInterval(checkStatus, 15000);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [uuid, status]);

    // Live continuous ticking uptime timer
    useEffect(() => {
        if (!isHibernating) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setUptime((prev) => prev + 1);
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isHibernating]);

    // Update any 'Offline' badge text in the header to 'Hibernating'
    useEffect(() => {
        if (!isHibernating || status !== 'offline') return;

        const updateBadges = () => {
            const elements = document.querySelectorAll('span, div, p');
            elements.forEach((el) => {
                if (el.children.length === 0 && el.textContent?.trim() === 'Offline') {
                    el.textContent = 'Hibernating';
                }
            });
        };

        updateBadges();
        const badgeInterval = setInterval(updateBadges, 1000);

        return () => {
            clearInterval(badgeInterval);
        };
    }, [isHibernating, status]);

    // Don't render if server is running, starting, or not hibernating
    if (status !== 'offline' || !isHibernating) {
        return null;
    }

    return (
        <div className="w-full mb-4 rounded-lg bg-neutral-900/60 border border-neutral-700/60 p-4 transition-all">
            <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-300 border border-neutral-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Hibernating
                </span>
                <span className="text-xs text-neutral-400 font-medium">SmartSleep Resource Saver</span>
            </div>
            <p className="text-xs text-neutral-400 mb-3">
                Server is currently in hibernation mode saving 100% RAM & CPU. Connect in Minecraft to wake and join.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-700/40">
                {/* State */}
                <div className="bg-neutral-800/50 rounded p-2.5 border border-neutral-700/40">
                    <div className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faMoon} className="text-neutral-400" />
                        <span>State</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1">
                        Hibernating
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                        Ready to join
                    </div>
                </div>

                {/* Uptime */}
                <div className="bg-neutral-800/50 rounded p-2.5 border border-neutral-700/40">
                    <div className="text-xs text-neutral-400 font-medium flex items-center gap-1.5">
                        <FontAwesomeIcon icon={faClock} className="text-neutral-400" />
                        <span>Uptime</span>
                    </div>
                    <div className="text-sm font-semibold text-neutral-200 mt-1 font-mono">
                        {formatSeconds(uptime)}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                        Continuous
                    </div>
                </div>

                {/* CPU Usage */}
                <div className="bg-neutral-800/50 rounded p-2.5 border border-neutral-700/40">
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

                {/* Memory Usage */}
                <div className="bg-neutral-800/50 rounded p-2.5 border border-neutral-700/40">
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

export default SmartSleepStatus;
