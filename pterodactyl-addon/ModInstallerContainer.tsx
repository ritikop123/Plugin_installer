import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faFolder,
  faFolderOpen,
  faSpinner,
  faPuzzlePiece,
  faCubes,
  faCube,
  faExternalLinkAlt,
  faDownload,
  faClock,
  faCheck,
  faTrashAlt,
  faPlus,
  faSyncAlt,
  faExclamationTriangle,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
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
  date_modified?: string;
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

interface PteroFileItem {
  name: string;
  size: number;
  isFile: boolean;
  modifiedAt: string;
}

export default function ModInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  // Tabs: 'browse' | 'installed'
  const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse');

  // Search & Filter State
  const [query, setQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [loader, setLoader] = useState<string>('all');
  const [gameVersion, setGameVersion] = useState<string>('all');
  const [availableGameVersions, setAvailableGameVersions] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>('downloads');
  const [page, setPage] = useState<number>(1);
  const pageSize = 21;

  // Browse Data State
  const [plugins, setPlugins] = useState<ModrinthSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Installed Data State
  const [installedFiles, setInstalledFiles] = useState<PteroFileItem[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState<boolean>(false);
  const [uninstallingFile, setUninstallingFile] = useState<string | null>(null);

  // Modal State (Compact)
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

  // Helper formatting functions
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '0.00 MB';
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const formatTimeAgo = (dateString?: string): string => {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}d ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `about ${months} ${months === 1 ? 'month' : 'months'} ago`;
    const years = Math.floor(days / 365);
    return `about ${years} ${years === 1 ? 'year' : 'years'} ago`;
  };

  // Load dynamic game versions from backend
  useEffect(() => {
    let isMounted = true;
    http.get<GameVersionTag[]>(`/api/client/servers/${uuid}/mods/tags`)
      .then((res) => {
        if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
          const versionsList = res.data.map((item) => item.version).slice(0, 30);
          setAvailableGameVersions(versionsList);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [uuid]);

  // Robustly fetch installed plugins from /mods directory
  const fetchInstalledPlugins = useCallback(() => {
    setLoadingInstalled(true);

    const parseFiles = (rawItems: any[]): PteroFileItem[] => {
      return rawItems
        .map((item: any) => {
          const attr = item.attributes || item;
          return {
            name: String(attr.name || ''),
            size: Number(attr.size || 0),
            isFile: attr.is_file ?? attr.isFile ?? !attr.directory ?? true,
            modifiedAt: String(attr.modified_at || attr.modifiedAt || ''),
          };
        })
        .filter((f) => f.isFile && /\.(jar|zip)$/i.test(f.name));
    };

    // 1. Try our dedicated controller endpoint first
    http.get<Array<{ name: string; size: number; modified_at?: string }>>(
      `/api/client/servers/${uuid}/mods/installed`
    )
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length > 0) {
          setInstalledFiles(
            list.map((item) => ({
              name: item.name,
              size: item.size || 0,
              isFile: true,
              modifiedAt: item.modified_at || '',
            }))
          );
          setLoadingInstalled(false);
        } else {
          // 2. Fallback to Pterodactyl native file list endpoint
          http.get(`/api/client/servers/${uuid}/files/list`, {
            params: { directory: '/mods' },
          })
            .then((fileRes) => {
              const raw = Array.isArray(fileRes.data)
                ? fileRes.data
                : Array.isArray((fileRes.data as any)?.data)
                ? (fileRes.data as any).data
                : [];
              setInstalledFiles(parseFiles(raw));
            })
            .catch(() => setInstalledFiles([]))
            .finally(() => setLoadingInstalled(false));
        }
      })
      .catch(() => {
        // Fallback if controller endpoint not refreshed
        http.get(`/api/client/servers/${uuid}/files/list`, {
          params: { directory: '/mods' },
        })
          .then((fileRes) => {
            const raw = Array.isArray(fileRes.data)
              ? fileRes.data
              : Array.isArray((fileRes.data as any)?.data)
              ? (fileRes.data as any).data
              : [];
            setInstalledFiles(parseFiles(raw));
          })
          .catch(() => setInstalledFiles([]))
          .finally(() => setLoadingInstalled(false));
      });
  }, [uuid]);

  // Load installed plugins on mount so install status is immediately known
  useEffect(() => {
    fetchInstalledPlugins();
  }, [fetchInstalledPlugins]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [query]);

  // Fetch plugins via Pterodactyl PHP Backend
  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await http.get<{ hits: ModrinthSearchHit[]; total_hits: number }>(
        `/api/client/servers/${uuid}/mods`,
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
      setError(httpErrorToHuman(err) || 'Unable to load plugins from the server backend.');
    } finally {
      setLoading(false);
    }
  }, [uuid, debouncedQuery, loader, gameVersion, sortBy, page, availableGameVersions.length]);

  useEffect(() => {
    if (activeTab === 'browse') {
      fetchPlugins();
    }
  }, [fetchPlugins, activeTab]);

  // Uninstall / Delete plugin file from /mods
  const handleUninstall = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete and uninstall ${filename}?`)) {
      return;
    }

    setUninstallingFile(filename);
    try {
      try {
        await http.post(`/api/client/servers/${uuid}/mods/delete`, { filename });
      } catch {
        await http.post(`/api/client/servers/${uuid}/files/delete`, {
          root: '/mods',
          files: [filename],
        });
      }
      setInstalledFiles((prev) => prev.filter((f) => f.name !== filename));
      fetchInstalledPlugins();
    } catch (err: unknown) {
      alert(httpErrorToHuman(err) || `Failed to delete ${filename}`);
    } finally {
      setUninstallingFile(null);
    }
  };

  // Fetch versions when a plugin is selected for compact modal
  useEffect(() => {
    if (!selectedPlugin) return;

    setLoadingVersions(true);
    setVersions([]);
    setVersionError(null);
    setModalSoftware('all');
    setModalGameVersion('all');
    setModalType('all');
    setInstallNotice(null);

    http.get<ModrinthVersion[]>(`/api/client/servers/${uuid}/mods/versions`, {
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
        setVersionError(httpErrorToHuman(err) || 'Failed to load versions for this plugin.');
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
        `/api/client/servers/${uuid}/mods/install`,
        {
          url: file.url,
          filename: file.filename,
        }
      );

      setInstalledVersions((prev) => ({ ...prev, [ver.id]: true }));
      setInstallNotice({
        success: true,
        message: response.data.message || `Plugin ${file.filename} was successfully installed into /mods!`,
      });
      fetchInstalledPlugins();
    } catch (err: unknown) {
      setInstallNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Failed to install plugin to server.',
      });
    } finally {
      setInstallingId(null);
    }
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

  // Match an installed file on server to a Modrinth plugin
  const getInstalledFileForPlugin = (plugin: ModrinthSearchHit): PteroFileItem | undefined => {
    const titleClean = plugin.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const slugClean = (plugin.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return installedFiles.find((f) => {
      const fn = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        (titleClean.length >= 3 && fn.includes(titleClean)) ||
        (slugClean.length >= 3 && fn.includes(slugClean))
      );
    });
  };

  return (
    <ServerContentBlock title={'Mods Installer'}>
      <div className="max-w-7xl mx-auto space-y-5 my-2">
        {/* Header Bar */}
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Mods Installer</h1>
            <p className="text-xs text-slate-400 mt-0.5">Discover and manage Forge, Fabric, NeoForge, and Quilt mods for your server.</p>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-6 border-b border-white/10 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('browse')}
              className={`flex items-center gap-2 pb-2.5 -mb-px transition-colors ${
                activeTab === 'browse'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FontAwesomeIcon icon={faSearch} className="text-[11px]" />
              <span>Browse</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('installed');
                fetchInstalledPlugins();
              }}
              className={`flex items-center gap-2 pb-2.5 -mb-px transition-colors ${
                activeTab === 'installed'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FontAwesomeIcon icon={faFolder} className="text-[11px]" />
              <span>Installed</span>
              {installedFiles.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-300 font-mono">
                  {installedFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab 1: Browse View */}
        {activeTab === 'browse' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-[#111728]/70 backdrop-blur-md border border-slate-800/80 rounded-xl p-3 shadow-lg">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Platform */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Platform
                  </label>
                  <select
                    disabled
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none cursor-default"
                  >
                    <option value="modrinth">Modrinth</option>
                  </select>
                </div>

                {/* Version */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Version
                  </label>
                  <select
                    value={gameVersion}
                    onChange={(e) => {
                      setGameVersion(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none transition-colors"
                  >
                    <option value="all">All Versions</option>
                    {availableGameVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Loader */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Loader
                  </label>
                  <select
                    value={loader}
                    onChange={(e) => {
                      setLoader(e.target.value);
                      setPage(1);
                    }}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white focus:outline-none transition-colors"
                  >
                    <option value="all">All Loaders</option>
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                    <option value="neoforge">NeoForge</option>
                    <option value="quilt">Quilt</option>
                  </select>
                </div>

                {/* Search */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Search
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-slate-500 pointer-events-none">
                      <FontAwesomeIcon icon={faSearch} className="text-xs" />
                    </span>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search..."
                      className="w-full pl-8 pr-7 py-2 bg-slate-950/60 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
                    />
                    {query && (
                      <button
                        onClick={() => setQuery('')}
                        className="absolute right-2.5 text-xs text-slate-500 hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Loading Indicator */}
            {loading && (
              <div className="py-20 text-center text-slate-400 space-y-2">
                <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-400 inline-block" />
                <p className="text-xs font-medium">Searching verified plugins...</p>
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                <span>{error}</span>
                <button
                  onClick={() => fetchPlugins()}
                  className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Empty State */}
            {!loading && !error && plugins.length === 0 && (
              <div className="py-20 text-center text-slate-400 space-y-3">
                <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-slate-600 block mx-auto mb-2" />
                <h3 className="text-sm font-bold text-white">No mods found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  No plugins match your current filters. Try searching for a different keyword or loader.
                </p>
              </div>
            )}

            {/* 3-Column Translucent Card Grid */}
            {!loading && !error && plugins.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {plugins.map((plugin) => {
                    const installedPluginFile = getInstalledFileForPlugin(plugin);
                    const isInstalled = !!installedPluginFile;

                    return (
                      <div
                        key={plugin.project_id}
                        className="group relative flex flex-col justify-between p-4 bg-slate-900/40 hover:bg-slate-900/60 backdrop-blur-md border border-slate-800/80 hover:border-blue-500/40 rounded-xl transition-all duration-200 shadow-md"
                      >
                        <div>
                          {/* Top: Icon, Title, Author, External Link */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-xl bg-slate-950/70 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                                {plugin.icon_url ? (
                                  <img src={plugin.icon_url} alt={plugin.title} className="w-full h-full object-cover" />
                                ) : (
                                  <FontAwesomeIcon icon={faCubes} className="text-lg text-purple-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <h3
                                    onClick={() => setSelectedPlugin(plugin)}
                                    className="text-sm font-bold text-white hover:text-blue-400 transition-colors truncate cursor-pointer"
                                  >
                                    {plugin.title}
                                  </h3>
                                </div>
                                <p className="text-xs text-slate-400 truncate mt-0.5">By {plugin.author}</p>
                              </div>
                            </div>

                            {/* External Link Icon */}
                            <a
                              href={`https://modrinth.com/plugin/${plugin.slug || plugin.project_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-500 hover:text-slate-300 p-1 transition-colors shrink-0"
                              title="View on Modrinth"
                            >
                              <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" />
                            </a>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-slate-300 mt-2.5 line-clamp-2 leading-relaxed">
                            {plugin.description || 'No description provided.'}
                          </p>
                        </div>

                        {/* Bottom Row: Downloads, Relative Date, + Install / Installed + Delete */}
                        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1 font-medium text-slate-300">
                              <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                              <span>{formatNumber(plugin.downloads)}</span>
                            </span>
                            <span className="flex items-center gap-1 text-slate-400">
                              <FontAwesomeIcon icon={faClock} className="text-[10px]" />
                              <span>{formatTimeAgo(plugin.date_modified)}</span>
                            </span>
                          </div>

                          {/* Action Button: Installed + Delete OR Install */}
                          {isInstalled && installedPluginFile ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => setSelectedPlugin(plugin)}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 flex items-center gap-1 transition-all"
                              >
                                <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                                <span>Installed</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUninstall(installedPluginFile.name);
                                }}
                                disabled={uninstallingFile === installedPluginFile.name}
                                className="p-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 hover:text-white transition-all flex items-center justify-center w-7 h-7"
                                title={`Uninstall ${installedPluginFile.name}`}
                              >
                                <FontAwesomeIcon icon={uninstallingFile === installedPluginFile.name ? faSpinner : faTrashAlt} spin={uninstallingFile === installedPluginFile.name} className="text-[11px]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSelectedPlugin(plugin)}
                              className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 flex items-center gap-1.5 transition-all shrink-0"
                            >
                              <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
                              <span>Install</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-2 py-3 border-t border-white/5 text-xs text-slate-400">
                    <span>
                      Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, totalHits)} of {totalHits} plugins
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-1.5 rounded-lg bg-slate-900/50 border border-blue-500/30 font-semibold text-blue-300">
                        Page {page} of {totalPages}
                      </span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Installed Plugins View (Matching Screenshot 3) */}
        {activeTab === 'installed' && (
          <div className="space-y-4">
            <div className="bg-slate-900/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Installed Mods in /mods</h3>
                <p className="text-xs text-slate-400">Manage all mod .jar files currently loaded on this server</p>
              </div>
              <button
                onClick={() => fetchInstalledPlugins()}
                disabled={loadingInstalled}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <FontAwesomeIcon icon={loadingInstalled ? faSpinner : faSyncAlt} spin={loadingInstalled} className="text-[11px]" />
                <span>{loadingInstalled ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>

            {loadingInstalled && (
              <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-400" />
                <span>Scanning /mods directory in server container...</span>
              </div>
            )}

            {!loadingInstalled && installedFiles.length === 0 && (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <FontAwesomeIcon icon={faFolderOpen} className="text-3xl text-slate-600 block mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white">No mods installed</h4>
                <p className="text-xs text-slate-500">
                  You haven&apos;t installed any plugins yet. Switch to the Browse tab to install mods.
                </p>
              </div>
            )}

            {/* Exact 3-column cards matching Screenshot 3 */}
            {!loadingInstalled && installedFiles.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {installedFiles.map((file) => (
                  <div
                    key={file.name}
                    className="bg-[#111728]/70 hover:bg-[#151d32]/90 backdrop-blur-md border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Left square puzzle icon box */}
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center shrink-0 text-purple-400">
                        <FontAwesomeIcon icon={faCubes} className="text-base text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {formatSize(file.size)}
                        </p>
                      </div>
                    </div>

                    {/* Right square delete trash button */}
                    <button
                      onClick={() => handleUninstall(file.name)}
                      disabled={uninstallingFile === file.name}
                      className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 border border-slate-700/60 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 flex items-center justify-center transition-all shrink-0"
                      title={`Delete ${file.name}`}
                    >
                      <FontAwesomeIcon icon={uninstallingFile === file.name ? faSpinner : faTrashAlt} spin={uninstallingFile === file.name} className="text-xs" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Compact Version Selection Modal */}
        {selectedPlugin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm">
            <div className="relative flex flex-col w-full max-w-lg max-h-[75vh] bg-[#0d121f]/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-4 py-3 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                    {selectedPlugin.icon_url ? (
                      <img src={selectedPlugin.icon_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <FontAwesomeIcon icon={faCubes} className="text-purple-400 text-base" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-white truncate">{selectedPlugin.title}</h2>
                    <p className="text-[11px] text-slate-400 truncate">By {selectedPlugin.author}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPlugin(null)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center font-bold text-xs transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>

              {/* Install Notice Banner */}
              {installNotice && (
                <div
                  className={`px-4 py-2 border-b text-xs font-medium flex items-center gap-2 ${
                    installNotice.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <FontAwesomeIcon icon={installNotice.success ? faCheck : faExclamationTriangle} className="text-xs" />
                  <span className="truncate">{installNotice.message}</span>
                </div>
              )}

              {/* Compact Filters Row */}
              <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/80 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Platform
                    </label>
                    <select
                      value={modalSoftware}
                      onChange={(e) => setModalSoftware(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded-md text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">All Platforms</option>
                      {availableModalLoaders.map((l) => (
                        <option key={l} value={l}>
                          {l.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      MC Version
                    </label>
                    <select
                      value={modalGameVersion}
                      onChange={(e) => setModalGameVersion(e.target.value)}
                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded-md text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">All Versions</option>
                      {availableModalGameVersions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Release Type Compact Pills */}
                <div className="flex items-center gap-1 pt-0.5">
                  {(['all', 'release', 'beta', 'alpha'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setModalType(type)}
                      className={`flex-1 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                        modalType === type
                          ? type === 'release'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : type === 'beta'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : type === 'alpha'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Version Items List */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2">
                {loadingVersions && (
                  <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                    <FontAwesomeIcon icon={faSpinner} spin className="text-lg text-blue-400" />
                    <span>Loading versions from Modrinth...</span>
                  </div>
                )}

                {versionError && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                    {versionError}
                  </div>
                )}

                {!loadingVersions && !versionError && filteredVersions.length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No matching versions found for your selected filters.
                  </div>
                )}

                {!loadingVersions &&
                  !versionError &&
                  filteredVersions.map((ver) => {
                    const primaryFile = ver.files?.find((f) => f.primary) || ver.files?.[0];
                    const isAlreadyInstalled =
                      installedVersions[ver.id] ||
                      (primaryFile && installedFiles.some((f) => f.name.toLowerCase() === primaryFile.filename.toLowerCase()));
                    const isInstalling = installingId === ver.id;

                    return (
                      <div
                        key={ver.id}
                        className="p-2.5 rounded-xl bg-slate-900/50 hover:bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">
                              {ver.name || ver.version_number}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
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

                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 truncate">
                            <span>{formatSize(primaryFile?.size)}</span>
                            <span>•</span>
                            <span>{ver.loaders?.slice(0, 2).join(', ')}</span>
                            <span>•</span>
                            <span>MC: {ver.game_versions?.slice(0, 2).join(', ')}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {primaryFile && (
                            <a
                              href={primaryFile.url}
                              download={primaryFile.filename}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition-colors flex items-center justify-center w-7 h-7"
                              title="Direct Download File (.jar)"
                            >
                              <FontAwesomeIcon icon={faDownload} className="text-[11px]" />
                            </a>
                          )}

                          {isAlreadyInstalled && primaryFile ? (
                            <div className="flex items-center gap-1">
                              <button
                                disabled
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default flex items-center gap-1"
                              >
                                <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                                <span>Installed</span>
                              </button>
                              <button
                                onClick={() => handleUninstall(primaryFile.filename)}
                                disabled={uninstallingFile === primaryFile.filename}
                                className="p-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 border border-rose-500/40 hover:text-white transition-all flex items-center justify-center w-7 h-7"
                                title={`Uninstall ${primaryFile.filename}`}
                              >
                                <FontAwesomeIcon icon={uninstallingFile === primaryFile.filename ? faSpinner : faTrashAlt} spin={uninstallingFile === primaryFile.filename} className="text-[11px]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleInstall(ver)}
                              disabled={isInstalling || !primaryFile}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center gap-1.5 transition-all"
                            >
                              {isInstalling ? (
                                <>
                                  <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />
                                  <span>Installing...</span>
                                </>
                              ) : (
                                <>
                                  <FontAwesomeIcon icon={faDownload} className="text-[10px]" />
                                  <span>Install</span>
                                </>
                              )}
                            </button>
                          )}
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
