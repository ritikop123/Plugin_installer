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
} from "@fortawesome/free-solid-svg-icons";

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
            });
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
                badgeClass: "bg-white/10 text-gray-300 border border-white/15",
                dotClass: "bg-gray-400",
                cardBorder: "",
                expiryBoxClass: "bg-black/20 border border-white/10",
                expiryTextClass: "text-white",
                expiryIconClass: "text-arix",
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
                badgeClass: "bg-red-500/20 text-red-300 border border-red-500/40",
                dotClass: "bg-red-400 animate-pulse",
                cardBorder: "border-red-500/40",
                expiryBoxClass: "bg-red-500/15 border border-red-500/40",
                expiryTextClass: "text-red-300 font-bold",
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
                badgeClass: "bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse",
                dotClass: "bg-red-400",
                cardBorder: "border-red-500/40",
                expiryBoxClass: "bg-red-500/15 border border-red-500/40",
                expiryTextClass: "text-red-300 font-bold",
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
                badgeClass: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
                dotClass: "bg-yellow-400",
                cardBorder: "border-yellow-500/40",
                expiryBoxClass: "bg-yellow-500/15 border border-yellow-500/40",
                expiryTextClass: "text-yellow-300 font-bold",
                expiryIconClass: "text-yellow-400",
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
            badgeClass: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40",
            dotClass: "bg-emerald-400",
            cardBorder: "",
            expiryBoxClass: "bg-black/20 border border-white/10",
            expiryTextClass: "text-white font-bold",
            expiryIconClass: "text-arix",
            relativeText: `Valid for ${days} more days`,
            warning: null,
        };
    }, [expireAt, formattedExpiry]);

    return (
        <div
            className={`bg-gray-700 backdrop boxBorder overflow-hidden rounded-box p-6 transition-all duration-300 ${status.cardBorder}`}
        >
            {/* Header: Title & Status Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-5 border-b border-gray-600/60">
                <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-component bg-arix text-white flex items-center justify-center shadow">
                        <FontAwesomeIcon icon={faShieldAlt} className="text-xl" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">
                            Server Plan & Expiration
                        </h3>
                        <p className="text-xs text-gray-300 mt-0.5">
                            Billing details, plan tier, and automated suspension status
                        </p>
                    </div>
                </div>

                <div>
                    <span
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${status.badgeClass}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${status.dotClass}`} />
                        {status.label}
                    </span>
                </div>
            </div>

            {/* 3 Metrics Grid: Expiration Date, Plan Name, Plan Price */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Expiration Date & Time */}
                <div className={`p-4 rounded-component transition-all ${status.expiryBoxClass}`}>
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                        <FontAwesomeIcon icon={faClock} className={status.expiryIconClass} />
                        <span>Expiration Date & Time</span>
                    </div>
                    <div className={`text-lg tracking-tight ${status.expiryTextClass}`}>
                        {formattedExpiry}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        {status.relativeText}
                    </div>
                </div>

                {/* 2. Plan Name */}
                <div className="p-4 rounded-component bg-black/20 border border-white/10">
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                        <FontAwesomeIcon icon={faBox} className="text-arix" />
                        <span>Plan Name</span>
                    </div>
                    <div className="text-lg font-bold text-white tracking-tight">
                        {planName || "N/A"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Assigned server plan tier
                    </div>
                </div>

                {/* 3. Plan Price */}
                <div className="p-4 rounded-component bg-black/20 border border-white/10">
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-1.5 uppercase tracking-wider">
                        <FontAwesomeIcon icon={faCreditCard} className="text-arix" />
                        <span>Plan Price</span>
                    </div>
                    <div className="text-lg font-bold text-white tracking-tight">
                        {planPrice || "N/A"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        Recurring subscription cost
                    </div>
                </div>
            </div>

            {/* Warning / Urgent Alert Banner */}
            {status.warning && (
                <div
                    className={`mt-5 p-4 rounded-component border flex items-center gap-3 text-sm ${
                        status.warning.level === "red"
                            ? "bg-red-500/15 border-red-500/40 text-red-200"
                            : "bg-yellow-500/15 border-yellow-500/40 text-yellow-200"
                    }`}
                >
                    <FontAwesomeIcon
                        icon={faExclamationTriangle}
                        className={`text-lg shrink-0 ${
                            status.warning.level === "red" ? "text-red-400 animate-pulse" : "text-yellow-400"
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
