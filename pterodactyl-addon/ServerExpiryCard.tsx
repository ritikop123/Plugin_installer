import React, { useState, useEffect, useMemo } from "react";
import { ServerContext } from "@/state/server";
import http from "@/api/http";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faClock,
    faCalendarAlt,
    faShieldAlt,
    faBox,
    faCreditCard,
    faExclamationTriangle,
    faCheckCircle,
    faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";

interface ServerExpiryData {
    expire_at: string | null;
    plan_name: string | null;
    plan_price: string | null;
}

const ServerExpiryCard: React.FC = () => {
    const server = ServerContext.useStoreState((state) => state.server.data);
    const uuid = server?.uuid;

    const [expireAt, setExpireAt] = useState<string | null>(
        (server as any)?.expire_at || null
    );
    const [planName, setPlanName] = useState<string | null>(
        (server as any)?.plan_name || null
    );
    const [planPrice, setPlanPrice] = useState<string | null>(
        (server as any)?.plan_price || null
    );
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!uuid) return;

        // Sync with ServerContext if present
        if ((server as any)?.expire_at !== undefined && (server as any)?.expire_at !== null) {
            setExpireAt((server as any).expire_at);
        }
        if ((server as any)?.plan_name !== undefined && (server as any)?.plan_name !== null) {
            setPlanName((server as any).plan_name);
        }
        if ((server as any)?.plan_price !== undefined && (server as any)?.plan_price !== null) {
            setPlanPrice((server as any).plan_price);
        }

        // Fetch fresh details from options API endpoint
        http.get(`/api/client/servers/${uuid}/options`)
            .then(({ data }) => {
                if (data.expire_at !== undefined) setExpireAt(data.expire_at);
                if (data.plan_name !== undefined) setPlanName(data.plan_name);
                if (data.plan_price !== undefined) setPlanPrice(data.plan_price);
            })
            .catch(() => {
                // Fallback to subscription endpoint if options fails
                http.get(`/api/client/servers/${uuid}/subscription`)
                    .then(({ data }) => {
                        const sub = data?.data || data;
                        if (sub.expires_at) setExpireAt(sub.expires_at);
                        if (sub.product && sub.product !== "N/A") setPlanName(sub.product);
                        if (sub.price?.amount && sub.price.amount !== "N/A") {
                            setPlanPrice(sub.price.amount + (sub.price.currency ? " " + sub.price.currency : ""));
                        }
                    })
                    .catch(() => {});
            })
            .finally(() => setLoading(false));
    }, [uuid]);

    // Format Expiration Date & Time
    const formattedExpiry = useMemo(() => {
        if (!expireAt) return "N/A";
        try {
            const d = new Date(expireAt);
            if (isNaN(d.getTime())) return String(expireAt);
            return d.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return String(expireAt);
        }
    }, [expireAt]);

    // Calculate Remaining Time & Status Tier
    const status = useMemo(() => {
        if (!expireAt) {
            return {
                tier: "none",
                label: "NO EXPIRATION",
                badgeClass: "bg-neutral-700/60 text-neutral-300 border-neutral-600/50",
                dotClass: "bg-neutral-400",
                cardBorder: "border-neutral-700/60",
                expiryTextClass: "text-neutral-200",
                expiryIconClass: "text-neutral-400",
                relativeText: "Lifetime / No suspension date set",
                warning: null,
            };
        }

        const expiryTime = new Date(expireAt).getTime();
        const now = Date.now();
        const diffMs = expiryTime - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours <= 0) {
            return {
                tier: "expired",
                label: "EXPIRED / SUSPENDED",
                badgeClass: "bg-red-500/25 text-red-400 border-red-500/50",
                dotClass: "bg-red-500 animate-pulse",
                cardBorder: "border-red-500/60 shadow-lg shadow-red-500/10",
                expiryTextClass: "text-red-400 font-bold",
                expiryIconClass: "text-red-400",
                relativeText: "Server expired and scheduled for auto-suspension",
                warning: {
                    level: "red",
                    title: "Server Expired",
                    message: "This server has passed its expiration date and is subject to immediate suspension.",
                },
            };
        }

        if (diffHours <= 24) {
            const h = Math.max(1, Math.round(diffHours));
            return {
                tier: "urgent",
                label: `SUSPENDS IN ${h}H`,
                badgeClass: "bg-red-500/25 text-red-400 border-red-500/50 animate-pulse",
                dotClass: "bg-red-500",
                cardBorder: "border-red-500/60 shadow-lg shadow-red-500/10",
                expiryTextClass: "text-red-400 font-bold",
                expiryIconClass: "text-red-400",
                relativeText: `Auto-suspension triggers in ${h} hour${h > 1 ? "s" : ""}!`,
                warning: {
                    level: "red",
                    title: "Urgent: Auto-Suspension Imminent",
                    message: `This server will be automatically suspended in ${h} hour${h > 1 ? "s" : ""}. Please renew now to prevent service interruption!`,
                },
            };
        }

        if (diffHours <= 72) {
            const days = Math.ceil(diffHours / 24);
            return {
                tier: "warning",
                label: `EXPIRES IN ${days}D`,
                badgeClass: "bg-amber-500/25 text-amber-300 border-amber-500/50",
                dotClass: "bg-amber-400",
                cardBorder: "border-amber-500/60 shadow-lg shadow-amber-500/10",
                expiryTextClass: "text-amber-300 font-bold",
                expiryIconClass: "text-amber-400",
                relativeText: `Scheduled for suspension in ${days} days`,
                warning: {
                    level: "yellow",
                    title: "Attention: Expiration Approaching",
                    message: `This server is scheduled for auto-suspension in ${days} days (${formattedExpiry}). Please renew soon to ensure continuous uptime.`,
                },
            };
        }

        const days = Math.ceil(diffHours / 24);
        return {
            tier: "active",
            label: `ACTIVE (${days}D LEFT)`,
            badgeClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
            dotClass: "bg-emerald-400",
            cardBorder: "border-neutral-700/60 hover:border-cyan-500/40",
            expiryTextClass: "text-neutral-100 font-bold",
            expiryIconClass: "text-cyan-400",
            relativeText: `Valid for ${days} more days`,
            warning: null,
        };
    }, [expireAt, formattedExpiry]);

    return (
        <div
            className={`rounded-2xl bg-neutral-800/80 backdrop-blur-md border p-5 md:p-6 transition-all duration-300 shadow-xl ${status.cardBorder}`}
        >
            {/* Header: Title & Status Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-neutral-700/60">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                        <FontAwesomeIcon icon={faShieldAlt} className="text-lg" />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
                            Server Plan & Expiration
                        </h3>
                        <p className="text-xs text-neutral-400">
                            Billing details, plan tier, and automated suspension status
                        </p>
                    </div>
                </div>

                <div>
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border ${status.badgeClass}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${status.dotClass}`} />
                        {status.label}
                    </span>
                </div>
            </div>

            {/* 3 Metrics Grid: Expiration Date, Plan Name, Plan Price */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Expiration Date & Time */}
                <div
                    className={`p-4 rounded-xl border transition-all ${
                        status.tier === "expired" || status.tier === "urgent"
                            ? "bg-red-500/10 border-red-500/40"
                            : status.tier === "warning"
                            ? "bg-amber-500/10 border-amber-500/40"
                            : "bg-neutral-900/40 border-neutral-700/50"
                    }`}
                >
                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                        <FontAwesomeIcon icon={faClock} className={status.expiryIconClass} />
                        <span>Expiration Date & Time</span>
                    </div>
                    <div className={`text-lg tracking-tight ${status.expiryTextClass}`}>
                        {formattedExpiry}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                        {status.relativeText}
                    </div>
                </div>

                {/* 2. Plan Name */}
                <div className="p-4 rounded-xl border border-neutral-700/50 bg-neutral-900/40">
                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                        <FontAwesomeIcon icon={faBox} className="text-cyan-400" />
                        <span>Plan Name</span>
                    </div>
                    <div className="text-lg font-bold text-neutral-100 tracking-tight">
                        {planName || "N/A"}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                        Assigned server plan tier
                    </div>
                </div>

                {/* 3. Plan Price */}
                <div className="p-4 rounded-xl border border-neutral-700/50 bg-neutral-900/40">
                    <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-1.5 uppercase tracking-wider">
                        <FontAwesomeIcon icon={faCreditCard} className="text-emerald-400" />
                        <span>Plan Price</span>
                    </div>
                    <div className="text-lg font-bold text-neutral-100 tracking-tight">
                        {planPrice || "N/A"}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                        Recurring subscription cost
                    </div>
                </div>
            </div>

            {/* Warning / Urgent Alert Banner */}
            {status.warning && (
                <div
                    className={`mt-4 p-3.5 rounded-xl border flex items-center gap-3 text-sm ${
                        status.warning.level === "red"
                            ? "bg-red-500/15 border-red-500/40 text-red-200"
                            : "bg-amber-500/15 border-amber-500/40 text-amber-200"
                    }`}
                >
                    <FontAwesomeIcon
                        icon={faExclamationTriangle}
                        className={`text-lg shrink-0 ${
                            status.warning.level === "red" ? "text-red-400 animate-pulse" : "text-amber-400"
                        }`}
                    />
                    <div>
                        <span className="font-semibold">{status.warning.title}: </span>
                        <span>{status.warning.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServerExpiryCard;
