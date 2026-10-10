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
    faEdit,
    faTimes,
    faSave,
    faSpinner,
    faInfinity,
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
    const [canEdit, setCanEdit] = useState<boolean>(false);

    // Edit Modal State
    const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
    const [editPlanName, setEditPlanName] = useState<string>("");
    const [editPlanPrice, setEditPlanPrice] = useState<string>("");
    const [editExpireAt, setEditExpireAt] = useState<string>("");
    const [saving, setSaving] = useState<boolean>(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        if (!uuid) return;

        // Sync initial state with ServerContext if present
        if ((server as any)?.expire_at !== undefined && (server as any)?.expire_at !== null) {
            setExpireAt((server as any).expire_at);
        }
        if ((server as any)?.plan_name !== undefined && (server as any)?.plan_name !== null) {
            setPlanName((server as any).plan_name);
        }
        if ((server as any)?.plan_price !== undefined && (server as any)?.plan_price !== null) {
            setPlanPrice((server as any).plan_price);
        }

        // Fetch fresh details from subscription API endpoint
        http.get(`/api/client/servers/${uuid}/subscription`)
            .then(({ data }) => {
                const sub = data?.data || data;
                const exp = data?.expire_at !== undefined ? data.expire_at : (sub?.expires_at ?? sub?.expire_at);
                const pName = data?.plan_name ?? sub?.product;
                const pPrice = data?.plan_price ?? (sub?.price?.amount && sub.price.amount !== "N/A" ? (sub.price.amount + (sub.price.currency ? " " + sub.price.currency : "")) : null);

                if (exp !== undefined) setExpireAt(exp || null);
                if (pName !== undefined) setPlanName(pName && pName !== "N/A" ? pName : null);
                if (pPrice !== undefined) setPlanPrice(pPrice && pPrice !== "N/A" ? pPrice : null);
                if (data?.can_edit !== undefined) setCanEdit(Boolean(data.can_edit));
            })
            .catch(() => {
                // Secondary fallback to /options
                http.get(`/api/client/servers/${uuid}/options`)
                    .then(({ data }) => {
                        if (data.expire_at !== undefined) setExpireAt(data.expire_at || null);
                        if (data.plan_name !== undefined) setPlanName(data.plan_name && data.plan_name !== "N/A" ? data.plan_name : null);
                        if (data.plan_price !== undefined) setPlanPrice(data.plan_price && data.plan_price !== "N/A" ? data.plan_price : null);
                        if (data.can_edit !== undefined) setCanEdit(Boolean(data.can_edit));
                    })
                    .catch(() => {});
            });
    }, [uuid]);

    // Open Edit Modal with current values
    const handleOpenEdit = () => {
        setEditPlanName(planName && planName !== "N/A" ? planName : "");
        setEditPlanPrice(planPrice && planPrice !== "N/A" ? planPrice : "");
        if (expireAt) {
            try {
                const d = new Date(expireAt);
                const isoLocal = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16);
                setEditExpireAt(isoLocal);
            } catch {
                setEditExpireAt("");
            }
        } else {
            setEditExpireAt("");
        }
        setSaveError(null);
        setEditModalOpen(true);
    };

    // Save changes via API
    const handleSavePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uuid) return;
        setSaving(true);
        setSaveError(null);

        try {
            const payload: any = {
                plan_name: editPlanName.trim() || null,
                plan_price: editPlanPrice.trim() || null,
                expire_at: editExpireAt ? new Date(editExpireAt).toISOString() : null,
            };

            const { data } = await http.post(`/api/client/servers/${uuid}/subscription`, payload);
            setPlanName(data.plan_name ?? payload.plan_name);
            setPlanPrice(data.plan_price ?? payload.plan_price);
            setExpireAt(data.expire_at ?? payload.expire_at);
            setEditModalOpen(false);
        } catch (err: any) {
            setSaveError(
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                "Failed to update plan details. Please check your permissions or input."
            );
        } finally {
            setSaving(false);
        }
    };

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

    const displayPlanName = planName && planName !== "N/A" ? planName : "N/A";
    const displayPlanPrice = planPrice && planPrice !== "N/A" ? planPrice : "N/A";

    return (
        <div
            className={`bg-gray-700 backdrop boxBorder overflow-hidden rounded-box p-6 transition-all duration-300 ${status.cardBorder}`}
        >
            {/* Header: Title & Status Badge / Edit Button */}
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

                <div className="flex items-center gap-2.5">
                    <span
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${status.badgeClass}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${status.dotClass}`} />
                        {status.label}
                    </span>

                    {canEdit && (
                        <button
                            type="button"
                            onClick={handleOpenEdit}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all shadow-sm"
                            title="Edit server plan and expiration details (Admin)"
                        >
                            <FontAwesomeIcon icon={faEdit} className="text-xs" />
                            <span>Edit Plan</span>
                        </button>
                    )}
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
                        {displayPlanName}
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
                        {displayPlanPrice}
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

            {/* Admin Quick Edit Modal */}
            {editModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#1e232d] border border-neutral-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-4 bg-[#171b23] border-b border-neutral-800">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-arix/20 text-arix flex items-center justify-center">
                                    <FontAwesomeIcon icon={faEdit} className="text-sm" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Edit Server Plan & Expiration</h3>
                                    <p className="text-xs text-gray-400">Configure billing and suspension details (Admin Only)</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditModalOpen(false)}
                                className="text-gray-400 hover:text-white p-1.5 rounded-lg transition-colors"
                            >
                                <FontAwesomeIcon icon={faTimes} className="text-lg" />
                            </button>
                        </div>

                        {/* Modal Body Form */}
                        <form onSubmit={handleSavePlan} className="p-5 space-y-4">
                            {saveError && (
                                <div className="p-3 bg-red-500/15 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-center gap-2">
                                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 shrink-0" />
                                    <span>{saveError}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Plan Name
                                </label>
                                <input
                                    type="text"
                                    value={editPlanName}
                                    onChange={(e) => setEditPlanName(e.target.value)}
                                    placeholder="e.g. Starter 4GB, Diamond VIP (Leave empty for N/A)"
                                    className="w-full bg-[#12161f] border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-arix transition-colors placeholder:text-gray-500"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Custom plan tier title shown on the dashboard (shows N/A if empty).
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                                    Plan Price
                                </label>
                                <input
                                    type="text"
                                    value={editPlanPrice}
                                    onChange={(e) => setEditPlanPrice(e.target.value)}
                                    placeholder="e.g. $10.00/mo, ₹499/mo, Free (Leave empty for N/A)"
                                    className="w-full bg-[#12161f] border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-arix transition-colors placeholder:text-gray-500"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Billing rate shown on the card (shows N/A if empty).
                                </p>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                                        Expiration Date & Time
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setEditExpireAt("")}
                                        className="text-xs text-arix hover:underline flex items-center gap-1 font-medium"
                                    >
                                        <FontAwesomeIcon icon={faInfinity} className="text-xs" />
                                        <span>Set Lifetime (No Expiry)</span>
                                    </button>
                                </div>
                                <input
                                    type="datetime-local"
                                    value={editExpireAt}
                                    onChange={(e) => setEditExpireAt(e.target.value)}
                                    className="w-full bg-[#12161f] border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-arix transition-colors [color-scheme:dark]"
                                />
                                <p className="text-xs text-gray-400 mt-1">
                                    Automated suspension triggers on this date. Clear or leave empty for permanent lifetime server.
                                </p>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                                <button
                                    type="button"
                                    onClick={() => setEditModalOpen(false)}
                                    disabled={saving}
                                    className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-arix hover:bg-arix/90 text-white transition-all shadow flex items-center gap-2 disabled:opacity-50"
                                >
                                    {saving ? (
                                        <>
                                            <FontAwesomeIcon icon={faSpinner} className="fa-spin" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <FontAwesomeIcon icon={faSave} />
                                            <span>Save Plan Details</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServerExpiryCard;
