import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStoreState } from 'easy-peasy';
import http from '@/api/http';

interface ServerResult {
    id: number;
    uuid: string;
    uuidShort: string;
    name: string;
    description?: string;
    support_id: string;
    node: string;
    owner: string;
    status: string | null;
    is_suspended: boolean;
}

interface Props {
    className?: string;
}

const AdminSupportIdSearch: React.FC<Props> = ({ className = '' }) => {
    const rootAdmin = useStoreState((state: any) => state.user.data?.rootAdmin);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ServerResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Debounced search
    useEffect(() => {
        if (!rootAdmin) return;
        const trimmed = query.trim();
        if (!trimmed) {
            setResults([]);
            setIsOpen(false);
            setLoading(false);
            return;
        }

        setLoading(true);
        const timer = setTimeout(() => {
            http.get('/api/client/support-lookup', { params: { query: trimmed } })
                .then((res) => {
                    const data = res.data?.data || res.data?.servers || [];
                    setResults(data);
                    setIsOpen(true);
                    setSelectedIndex(-1);
                })
                .catch((err) => {
                    console.error('Support ID lookup failed:', err);
                    setResults([]);
                })
                .finally(() => {
                    setLoading(false);
                });
        }, 250);

        return () => clearTimeout(timer);
    }, [query, rootAdmin]);


    // Click outside listener
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const navigateToServer = useCallback((server: ServerResult) => {
        if (!server?.uuid) return;
        setIsOpen(false);
        window.location.href = `/server/${server.uuid}`;
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (results.length > 0) {
                setSelectedIndex((prev) => (prev + 1 >= results.length ? 0 : prev + 1));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (results.length > 0) {
                setSelectedIndex((prev) => (prev - 1 < 0 ? results.length - 1 : prev - 1));
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < results.length) {
                navigateToServer(results[selectedIndex]);
            } else if (results.length > 0) {
                navigateToServer(results[0]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const handleClear = () => {
        setQuery('');
        setResults([]);
        setIsOpen(false);
        inputRef.current?.focus();
    };

    if (!rootAdmin) {
        return null;
    }

    return (
        <div ref={containerRef} className={`relative w-full ${className}`}>
            <div className="group relative flex items-center bg-[#0d121c]/80 hover:bg-[#0f1624] focus-within:bg-[#0f1624] border border-neutral-700/60 focus-within:border-[#034f80] focus-within:shadow-[0_0_15px_rgba(3,79,128,0.45)] rounded-xl px-3 py-1.5 transition-all duration-200">
                {/* Search Icon */}
                <svg
                    className="w-4 h-4 text-neutral-400 group-focus-within:text-[#38bdf8] transition-colors shrink-0 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>

                {/* Input */}
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                        if (query.trim() && results.length > 0) {
                            setIsOpen(true);
                        }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search Support ID (SUP-...)"
                    className="w-full bg-transparent text-xs sm:text-sm text-neutral-100 placeholder-neutral-400 focus:outline-none"
                    autoComplete="off"
                    spellCheck={false}
                />

                {/* Loading spinner */}
                {loading && (
                    <svg
                        className="animate-spin h-3.5 w-3.5 text-[#38bdf8] shrink-0 ml-1.5"
                        viewBox="0 0 24 24"
                        fill="none"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                        />
                    </svg>
                )}

                {/* Clear button */}
                {!loading && query && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="text-neutral-400 hover:text-white p-0.5 rounded transition-colors shrink-0 ml-1"
                        title="Clear search"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}

                {/* Admin Pill */}
                <span className="hidden md:inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-[#38bdf8] bg-[#034f80]/30 border border-[#034f80]/60 px-1.5 py-0.5 rounded ml-2 shrink-0 select-none">
                    Admin
                </span>
            </div>

            {/* Dropdown Results */}
            {isOpen && query.trim() && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-[#0d131f] border border-neutral-700/80 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in duration-150">
                    <div className="px-3 py-1.5 bg-[#090d16] border-b border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400 font-semibold tracking-wider uppercase">
                        <span>Search Results</span>
                        <span>{results.length} found</span>
                    </div>

                    <div className="max-h-72 overflow-y-auto divide-y divide-neutral-800/60">
                        {results.length > 0 ? (
                            results.map((server, idx) => {
                                const isSelected = idx === selectedIndex;
                                return (
                                    <div
                                        key={server.uuid}
                                        onClick={() => navigateToServer(server)}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`px-3 py-2.5 cursor-pointer flex items-center justify-between transition-colors ${
                                            isSelected ? 'bg-[#034f80]/30' : 'hover:bg-neutral-800/50'
                                        }`}
                                    >
                                        <div className="min-w-0 pr-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white text-xs sm:text-sm truncate">
                                                    {server.name}
                                                </span>
                                                {server.is_suspended && (
                                                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40">
                                                        Suspended
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                                                <span>Node: {server.node}</span>
                                                <span>•</span>
                                                <span>Owner: {server.owner}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#034f80]/25 border border-[#034f80]/60 text-sky-300">
                                                {server.support_id}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigateToServer(server);
                                                }}
                                                className="bg-[#034f80] hover:bg-[#0465a3] text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                            >
                                                <span>Open</span>
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="px-4 py-6 text-center text-xs text-neutral-400">
                                <p className="font-medium text-neutral-300">No server found matching "{query}"</p>
                                <p className="text-[11px] text-neutral-500 mt-1">
                                    Try searching by full Support ID (e.g. SUP-XXXXXX), code, name, or UUID.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminSupportIdSearch;
