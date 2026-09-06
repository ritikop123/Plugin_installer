import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';

interface ModrinthSearchHit {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
}

interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

interface ModrinthVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  version_type: 'release' | 'beta' | 'alpha';
  loaders: string[];
  date_published: string;
  files: ModrinthVersionFile[];
}

interface GameVersionTag {
  version: string;
  version_type: string;
}

export default function PluginInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [loader, setLoader] = useState<string>('all');
  const [gameVersion, setGameVersion] = useState<string>('all');
  const [availableGameVersions, setAvailableGameVersions] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('downloads');
  const [page, setPage] = useState<number>(1);
  const pageSize = 21;

  const [plugins, setPlugins] = useState<ModrinthSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [selectedPlugin, setSelectedPlugin] = useState<ModrinthSearchHit | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Modal Filters
  const [modalSoftware, setModalSoftware] = useState<string>('all');
  const [modalGameVersion, setModalGameVersion] = useState<string>('all');
  const [modalType, setModalType] = useState<'all' | 'release' | 'beta' | 'alpha'>('all');

  // Installation States
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedVersions, setInstalledVersions] = useState<Record<string, boolean>>({});
  const [installNotice, setInstallNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Load dynamic game versions from backend
  useEffect(() => {
    let isMounted = true;
    http.get<GameVersionTag[]>(`/api/client/servers/${uuid}/plugins/tags`)
      .then((res) => {
        if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
          const versionsList = res.data.map((item) => item.version).slice(0, 30);
          setAvailableGameVersions(versionsList);
        }
      })
      .catch(() => {
        // Fallback: populate when search results arrive
      });

    return () => {
      isMounted = false;
    };
  }, [uuid]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [query]);

  // Fetch plugins via Pterodactyl PHP Backend
  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await http.get<{ hits: ModrinthSearchHit[]; total_hits: number }>(
        `/api/client/servers/${uuid}/plugins`,
        {
          params: {
            query: debouncedQuery.trim(),
            loader,
            game_version: gameVersion,
            sort_by: sortBy,
            page,
          },
        }
      );

      const hits = response.data.hits || [];
      setPlugins(hits);
      setTotalHits(response.data.total_hits || 0);

      // Extract dynamic game versions if not loaded yet
      if (availableGameVersions.length === 0 && hits.length > 0) {
        const extracted = Array.from(new Set(hits.flatMap((p) => p.versions || [])))
          .filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v))
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
          .slice(0, 30);
        if (extracted.length > 0) {
          setAvailableGameVersions(extracted);
        }
      }
    } catch (err: unknown) {
      const errorMsg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err as Error)?.message ||
        'Unable to load plugins from the server backend.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [uuid, debouncedQuery, loader, gameVersion, sortBy, page, availableGameVersions.length]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Fetch versions when a plugin is selected
  useEffect(() => {
    if (!selectedPlugin) return;

    setLoadingVersions(true);
    setVersions([]);
    setVersionError(null);
    setModalSoftware('all');
    setModalGameVersion('all');
    setModalType('all');
    setInstallNotice(null);

    http.get<ModrinthVersion[]>(`/api/client/servers/${uuid}/plugins/versions`, {
      params: { plugin: selectedPlugin.project_id || selectedPlugin.slug },
    })
      .then((res) => {
        if (Array.isArray(res.data)) {
          setVersions(res.data);
        } else {
          setVersions([]);
        }
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
          'Failed to load versions for this plugin.';
        setVersionError(msg);
      })
      .finally(() => {
        setLoadingVersions(false);
      });
  }, [uuid, selectedPlugin]);

  // Handle Installation through Pterodactyl PHP Controller
  const handleInstall = async (ver: ModrinthVersion) => {
    const file = ver.files?.find((f) => f.primary) || ver.files?.[0];
    if (!file) return;

    setInstallingId(ver.id);
    setInstallNotice(null);

    try {
      const response = await http.post<{ success: boolean; message: string }>(
        `/api/client/servers/${uuid}/plugins/install`,
        {
          url: file.url,
          filename: file.filename,
        }
      );

      setInstalledVersions((prev) => ({ ...prev, [ver.id]: true }));
      setInstallNotice({
        success: true,
        message: response.data.message || `Plugin ${file.filename} was successfully installed into /plugins!`,
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message ||
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Failed to install plugin to server.';
      setInstallNotice({
        success: false,
        message: msg,
      });
    } finally {
      setInstallingId(null);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Filter versions inside modal
  const filteredVersions = versions.filter((v) => {
    if (modalType !== 'all' && v.version_type !== modalType) return false;
    if (modalSoftware !== 'all' && !v.loaders?.includes(modalSoftware)) return false;
    if (modalGameVersion !== 'all' && !v.game_versions?.includes(modalGameVersion)) return false;
    return true;
  });

  const availableModalLoaders = Array.from(new Set(versions.flatMap((v) => v.loaders || []))).sort();
  const availableModalGameVersions = Array.from(new Set(versions.flatMap((v) => v.game_versions || []))).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  );
  const totalPages = Math.ceil(totalHits / pageSize);

  return (
    <ServerContentBlock title={'Plugin Installer'} css={['max-w-7xl mx-auto']}>
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="bg-[#101522] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xl shadow-lg">
              🧩
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white tracking-tight">Plugin Installer</h1>
              <p className="text-xs text-slate-400">Search and install plugins directly to your server container</p>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 pt-1">
            {/* Search Box */}
            <div className="lg:col-span-5 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search plugins (e.g. EssentialsX, LuckPerms, ViaVersion)..."
                className="w-full px-4 py-2.5 bg-[#0a0d14] border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none transition-all shadow-inner"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-500 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Software Loader Selector */}
            <div className="lg:col-span-3">
              <select
                value={loader}
                onChange={(e) => {
                  setLoader(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2.5 bg-[#0a0d14] border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none transition-all"
              >
                <option value="all">Software: All Platforms</option>
                <option value="paper">Software: Paper</option>
                <option value="purpur">Software: Purpur</option>
                <option value="spigot">Software: Spigot</option>
                <option value="velocity">Software: Velocity</option>
                <option value="bungeecord">Software: BungeeCord</option>
                <option value="folia">Software: Folia</option>
                <option value="fabric">Software: Fabric</option>
              </select>
            </div>

            {/* Dynamic Minecraft Version Selector */}
            <div className="lg:col-span-2">
              <select
                value={gameVersion}
                onChange={(e) => {
                  setGameVersion(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2.5 bg-[#0a0d14] border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none transition-all"
              >
                <option value="all">Version: All</option>
                {availableGameVersions.map((v) => (
                  <option key={v} value={v}>
                    Version: {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Selector */}
            <div className="lg:col-span-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2.5 bg-[#0a0d14] border border-slate-800 hover:border-slate-700 focus:border-cyan-500 rounded-xl text-xs text-white focus:outline-none transition-all"
              >
                <option value="downloads">Sort: Downloads</option>
                <option value="relevance">Sort: Relevance</option>
                <option value="updated">Sort: Updated</option>
                <option value="newest">Sort: Newest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="py-24 text-center text-slate-400 space-y-2">
            <div className="text-2xl animate-spin inline-block">⏳</div>
            <p className="text-xs font-medium">Searching verified plugins...</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => fetchPlugins()}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && plugins.length === 0 && (
          <div className="py-24 text-center text-slate-400 space-y-3">
            <div className="text-4xl">🔍</div>
            <h3 className="text-sm font-bold text-white">No plugins found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              We couldn't find any plugins matching your active filters. Try searching for something else.
            </p>
          </div>
        )}

        {/* 3-Column Desktop Cards Grid */}
        {!loading && !error && plugins.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plugins.map((plugin) => (
                <div
                  key={plugin.project_id}
                  onClick={() => setSelectedPlugin(plugin)}
                  className="group relative flex flex-col justify-between p-5 bg-[#101522] hover:bg-[#151b2d] border border-slate-800 hover:border-cyan-500/50 rounded-2xl cursor-pointer transition-all duration-200 shadow-lg hover:-translate-y-0.5"
                >
                  <div>
                    {/* Top: Icon, Title, Author, Stats */}
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-[#0a0d14] border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-md">
                        {plugin.icon_url ? (
                          <img src={plugin.icon_url} alt={plugin.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-2xl">📦</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                          {plugin.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5 truncate">
                          by <span className="text-slate-300 font-medium">{plugin.author}</span>
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1 font-medium text-slate-300">
                            ⬇ {formatNumber(plugin.downloads)}
                          </span>
                          <span className="flex items-center gap-1 text-slate-400">
                            ♥ {formatNumber(plugin.follows)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">
                      {plugin.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Bottom: Loaders and Action */}
                  <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-hidden max-h-6">
                      {(plugin.display_categories || plugin.categories || []).slice(0, 3).map((cat) => (
                        <span
                          key={cat}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-slate-800 border border-slate-700/60 text-cyan-300"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>

                    <button className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500 text-cyan-300 hover:text-black border border-cyan-500/30 transition-colors shrink-0">
                      Versions ➔
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-4 border-t border-slate-800 text-xs text-slate-400">
                <span>
                  Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalHits)} of {totalHits} plugins
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-xl bg-[#101522] border border-slate-800 hover:border-cyan-500/40 text-slate-300 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 rounded-xl bg-[#101522] border border-cyan-500/20 font-semibold text-cyan-300">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-xl bg-[#101522] border border-slate-800 hover:border-cyan-500/40 text-slate-300 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Version Selection Pop-up Modal */}
        {selectedPlugin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md">
            <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] bg-[#101522] border border-cyan-500/40 rounded-3xl shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#151b2d] border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3.5">
                  <div className="w-14 h-14 rounded-2xl bg-[#0a0d14] border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                    {selectedPlugin.icon_url ? (
                      <img src={selectedPlugin.icon_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl">📦</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">{selectedPlugin.title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">by {selectedPlugin.author}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPlugin(null)}
                  className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-sm transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Install Notice Banner */}
              {installNotice && (
                <div
                  className={`px-6 py-3 border-b text-xs font-semibold flex items-center gap-2 ${
                    installNotice.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <span>{installNotice.success ? '✓' : '⚠️'}</span>
                  <span>{installNotice.message}</span>
                </div>
              )}

              {/* Modal Filters Row */}
              <div className="px-6 py-3 bg-[#0d111a] border-b border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Software Platform */}
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Software</label>
                  <select
                    value={modalSoftware}
                    onChange={(e) => setModalSoftware(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#161c2d] border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">All Platforms</option>
                    {availableModalLoaders.map((l) => (
                      <option key={l} value={l}>
                        {l.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Minecraft Version */}
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Minecraft Version</label>
                  <select
                    value={modalGameVersion}
                    onChange={(e) => setModalGameVersion(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#161c2d] border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="all">All Versions</option>
                    {availableModalGameVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Version Release Type Tabs */}
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Release Type</label>
                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#161c2d] rounded-lg border border-slate-700 text-center">
                    {(['all', 'release', 'beta', 'alpha'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setModalType(type)}
                        className={`py-1 rounded text-[10px] font-bold uppercase transition-all ${
                          modalType === type
                            ? type === 'release'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : type === 'beta'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : type === 'alpha'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Version Items List */}
              <div className="flex-1 p-6 overflow-y-auto space-y-3">
                {loadingVersions && (
                  <div className="py-16 text-center text-slate-400 text-xs">Loading versions from Modrinth...</div>
                )}

                {versionError && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {versionError}
                  </div>
                )}

                {!loadingVersions && !versionError && filteredVersions.length === 0 && (
                  <div className="py-16 text-center text-slate-400 text-xs">
                    No matching versions found for your selected filters.
                  </div>
                )}

                {!loadingVersions &&
                  !versionError &&
                  filteredVersions.map((ver) => {
                    const primaryFile = ver.files?.find((f) => f.primary) || ver.files?.[0];
                    const isInstalled = installedVersions[ver.id];
                    const isInstalling = installingId === ver.id;

                    return (
                      <div
                        key={ver.id}
                        className="p-4 rounded-2xl bg-[#131929] hover:bg-[#161d31] border border-slate-800 hover:border-cyan-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white">{ver.name || ver.version_number}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-300 border border-slate-700/60">
                              {ver.version_number}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                                ver.version_type === 'release'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : ver.version_type === 'beta'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {ver.version_type}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                            <span>{formatSize(primaryFile?.size)}</span>
                            <span>•</span>
                            <span>Loaders: {ver.loaders?.join(', ')}</span>
                            <span>•</span>
                            <span>MC: {ver.game_versions?.slice(0, 3).join(', ')}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {primaryFile && (
                            <a
                              href={primaryFile.url}
                              download={primaryFile.filename}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors"
                              title="Direct Download File (.jar)"
                            >
                              💾
                            </a>
                          )}

                          <button
                            onClick={() => handleInstall(ver)}
                            disabled={isInstalling || !primaryFile}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                              isInstalled
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20'
                            }`}
                          >
                            {isInstalling ? 'Installing to /plugins...' : isInstalled ? '✓ Installed' : 'Install to Server'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
