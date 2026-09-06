import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';

// Compliant User-Agent for Modrinth API Guidelines
const USER_AGENT = 'Arix-Theme-PluginInstaller/1.0.0 (pterodactyl-addon@arix.gg)';
const MODRINTH_API = 'https://api.modrinth.com/v2';

interface ModrinthSearchHit {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
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

export default function PluginInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loader, setLoader] = useState('all');
  const [gameVersion, setGameVersion] = useState('all');
  const [sortBy, setSortBy] = useState('downloads');
  const [page, setPage] = useState(1);
  const pageSize = 21;

  const [plugins, setPlugins] = useState<ModrinthSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selected plugin for popup modal
  const [selectedPlugin, setSelectedPlugin] = useState<ModrinthSearchHit | null>(null);
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Modal filters
  const [modalSoftware, setModalSoftware] = useState('all');
  const [modalGameVersion, setModalGameVersion] = useState('all');
  const [modalType, setModalType] = useState<'all' | 'release' | 'beta' | 'alpha'>('all');

  // Install status tracking
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installedVersions, setInstalledVersions] = useState<Record<string, boolean>>({});
  const [installMessage, setInstallMessage] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch plugins from Modrinth API
  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);

    const facets: string[][] = [];
    if (loader !== 'all') {
      facets.push([`categories:${loader}`]);
    } else {
      facets.push([
        'categories:spigot',
        'categories:paper',
        'categories:purpur',
        'categories:velocity',
        'categories:bungeecord',
        'categories:folia',
        'categories:fabric',
      ]);
    }

    if (gameVersion !== 'all') {
      facets.push([`versions:${gameVersion}`]);
    }

    const params: Record<string, string | number> = {
      query: debouncedQuery.trim(),
      limit: pageSize,
      offset: (page - 1) * pageSize,
      index: sortBy,
    };

    if (facets.length > 0) {
      params.facets = JSON.stringify(facets);
    }

    try {
      const url = new URL(`${MODRINTH_API}/search`);
      Object.keys(params).forEach((key) => url.searchParams.append(key, String(params[key])));

      const res = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      if (!res.ok) throw new Error(`Modrinth returned HTTP ${res.status}`);
      const data = await res.json();
      setPlugins(data.hits || []);
      setTotalHits(data.total_hits || 0);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch plugins from Modrinth');
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, loader, gameVersion, sortBy, page]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Load versions when a plugin is opened
  useEffect(() => {
    if (!selectedPlugin) return;

    setLoadingVersions(true);
    setVersions([]);
    setModalSoftware('all');
    setModalGameVersion('all');
    setModalType('all');
    setInstallMessage(null);

    fetch(`${MODRINTH_API}/project/${selectedPlugin.project_id || selectedPlugin.slug}/version`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setVersions(data);
        }
      })
      .catch((e) => console.error('Version fetch error:', e))
      .finally(() => setLoadingVersions(false));
  }, [selectedPlugin]);

  // Handle native server installation through Pterodactyl Client API
  const handleInstallPlugin = async (ver: ModrinthVersion) => {
    const file = ver.files.find((f) => f.primary) || ver.files[0];
    if (!file) return;

    setInstallingId(ver.id);
    setInstallMessage(null);

    try {
      // Step 1: Ensure /plugins folder exists in container
      try {
        await http.post(`/api/client/servers/${uuid}/files/create-folder`, {
          root: '/',
          name: 'plugins',
        });
      } catch (e) {
        // Ignore if folder already exists
      }

      // Step 2: Trigger Pterodactyl Wings to pull/download .jar directly into /plugins
      await http.post(`/api/client/servers/${uuid}/files/pull`, {
        url: file.url,
        directory: '/plugins',
        filename: file.filename,
      });

      setInstalledVersions((prev) => ({ ...prev, [ver.id]: true }));
      setInstallMessage(`✓ Successfully installed ${file.filename} into /plugins!`);
    } catch (err: any) {
      const msg = err?.response?.data?.errors?.[0]?.detail || err?.message || 'Failed to install file to server';
      setInstallMessage(`⚠️ ${msg}`);
    } finally {
      setInstallingId(null);
    }
  };

  const formatNumber = (n: number) => (n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n);
  const formatSize = (bytes?: number) => (!bytes ? 'Unknown' : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`);

  // Filter versions inside modal
  const filteredVersions = versions.filter((v) => {
    if (modalType !== 'all' && v.version_type !== modalType) return false;
    if (modalSoftware !== 'all' && !v.loaders?.includes(modalSoftware)) return false;
    if (modalGameVersion !== 'all' && !v.game_versions?.includes(modalGameVersion)) return false;
    return true;
  });

  const availableLoaders = Array.from(new Set(versions.flatMap((v) => v.loaders || []))).sort();
  const availableGameVersions = Array.from(new Set(versions.flatMap((v) => v.game_versions || [])));
  const totalPages = Math.ceil(totalHits / pageSize);

  return (
    <ServerContentBlock title={'Plugin Installer'} css={['max-w-7xl mx-auto']}>
      <div className="space-y-6">
        {/* Header Filters Bar */}
        <div className="bg-[#101522] border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                🧩
              </div>
              <div>
                <h1 className="text-lg font-extrabold text-white">Plugin Installer</h1>
                <p className="text-xs text-slate-400">Search and install plugins directly to your server container</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-5 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search plugins (e.g. EssentialsX, LuckPerms, ViaVersion)..."
                className="w-full px-4 py-2.5 bg-[#0a0d14] border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Software Selector */}
            <div className="lg:col-span-3">
              <select
                value={loader}
                onChange={(e) => { setLoader(e.target.value); setPage(1); }}
                className="w-full px-3 py-2.5 bg-[#0a0d14] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
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

            {/* Minecraft Version */}
            <div className="lg:col-span-2">
              <select
                value={gameVersion}
                onChange={(e) => { setGameVersion(e.target.value); setPage(1); }}
                className="w-full px-3 py-2.5 bg-[#0a0d14] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">MC: All</option>
                <option value="1.21.4">MC: 1.21.4</option>
                <option value="1.21.1">MC: 1.21.1</option>
                <option value="1.21">MC: 1.21</option>
                <option value="1.20.4">MC: 1.20.4</option>
                <option value="1.20.1">MC: 1.20.1</option>
                <option value="1.19.4">MC: 1.19.4</option>
                <option value="1.16.5">MC: 1.16.5</option>
                <option value="1.12.2">MC: 1.12.2</option>
                <option value="1.8.9">MC: 1.8.9</option>
              </select>
            </div>

            {/* Sort */}
            <div className="lg:col-span-2">
              <select
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                className="w-full px-3 py-2.5 bg-[#0a0d14] border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="downloads">Sort: Downloads</option>
                <option value="relevance">Sort: Relevance</option>
                <option value="updated">Sort: Updated</option>
                <option value="newest">Sort: Newest</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="py-20 text-center text-slate-400">
            <p className="text-sm">Searching plugins...</p>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Plugins Grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plugins.map((plugin) => (
              <div
                key={plugin.project_id}
                onClick={() => setSelectedPlugin(plugin)}
                className="p-5 bg-[#101522] hover:bg-[#151b2d] border border-slate-800 hover:border-cyan-500/50 rounded-2xl cursor-pointer transition-all flex flex-col justify-between shadow-lg"
              >
                <div>
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#0a0d14] border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                      {plugin.icon_url ? (
                        <img src={plugin.icon_url} alt={plugin.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl">📦</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{plugin.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">by {plugin.author}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                        <span>⬇ {formatNumber(plugin.downloads)}</span>
                        <span>♥ {formatNumber(plugin.follows)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-300 mt-3 line-clamp-2 leading-relaxed">
                    {plugin.description || 'No description available'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1 overflow-hidden max-h-6">
                    {(plugin.display_categories || plugin.categories || []).slice(0, 3).map((cat) => (
                      <span key={cat} className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-cyan-300">
                        {cat}
                      </span>
                    ))}
                  </div>
                  <button className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500 hover:text-black transition-colors">
                    Versions ➔
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between py-4 border-t border-slate-800 text-xs text-slate-400">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg bg-[#101522] border border-slate-800 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg bg-[#101522] border border-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Version Pop-up Modal */}
        {selectedPlugin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] bg-[#101522] border border-cyan-500/40 rounded-3xl shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#151b2d] border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#0a0d14] overflow-hidden flex items-center justify-center shrink-0">
                    {selectedPlugin.icon_url ? (
                      <img src={selectedPlugin.icon_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span>📦</span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">{selectedPlugin.title}</h2>
                    <p className="text-xs text-slate-400">by {selectedPlugin.author}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPlugin(null)}
                  className="text-slate-400 hover:text-white p-2 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Status Notice */}
              {installMessage && (
                <div className="px-6 py-2.5 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  {installMessage}
                </div>
              )}

              {/* Modal Filters */}
              <div className="px-6 py-3 bg-[#0d111a] border-b border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 font-semibold mb-1">SOFTWARE</label>
                  <select
                    value={modalSoftware}
                    onChange={(e) => setModalSoftware(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#161c2d] border border-slate-700 rounded-lg text-xs text-white"
                  >
                    <option value="all">All Platforms</option>
                    {availableLoaders.map((l) => (
                      <option key={l} value={l}>{l.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 font-semibold mb-1">MINECRAFT VERSION</label>
                  <select
                    value={modalGameVersion}
                    onChange={(e) => setModalGameVersion(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-[#161c2d] border border-slate-700 rounded-lg text-xs text-white"
                  >
                    <option value="all">All Versions</option>
                    {availableGameVersions.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-400 font-semibold mb-1">RELEASE TYPE</label>
                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#161c2d] rounded-lg border border-slate-700 text-center">
                    {(['all', 'release', 'beta', 'alpha'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setModalType(t)}
                        className={`py-1 rounded text-[10px] font-bold uppercase ${
                          modalType === t ? 'bg-cyan-500/30 text-cyan-300' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Version Items List */}
              <div className="flex-1 p-6 overflow-y-auto space-y-3">
                {loadingVersions && (
                  <div className="py-12 text-center text-slate-400 text-xs">Loading versions from Modrinth...</div>
                )}

                {!loadingVersions && filteredVersions.length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-xs">No matching versions found.</div>
                )}

                {!loadingVersions && filteredVersions.map((v) => {
                  const file = v.files.find((f) => f.primary) || v.files[0];
                  const isInstalled = installedVersions[v.id];
                  const isInstalling = installingId === v.id;

                  return (
                    <div
                      key={v.id}
                      className="p-4 rounded-xl bg-[#131929] border border-slate-800 hover:border-cyan-500/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{v.name || v.version_number}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-cyan-300">
                            {v.version_number}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                            v.version_type === 'release' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {v.version_type}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>{formatSize(file?.size)}</span>
                          <span>•</span>
                          <span>Loaders: {v.loaders?.join(', ')}</span>
                          <span>•</span>
                          <span>MC: {v.game_versions?.slice(0, 3).join(', ')}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {file && (
                          <a
                            href={file.url}
                            download={file.filename}
                            target="_blank"
                            rel="noreferrer"
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                            title="Direct Download .jar"
                          >
                            💾
                          </a>
                        )}

                        <button
                          onClick={() => handleInstallPlugin(v)}
                          disabled={isInstalling || !file}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                            isInstalled
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-cyan-500 hover:bg-cyan-400 text-black font-bold'
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
