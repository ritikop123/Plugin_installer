import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPuzzlePiece,
  faSearch,
  faFolderOpen,
  faSpinner,
  faDownload,
  faCheck,
  faTrash,
  faTimes,
  faExclamationTriangle,
  faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';

interface ModrinthPluginHit {
  project_id: string;
  id?: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
}

interface ModrinthPluginFile {
  url: string;
  filename: string;
  primary?: boolean;
  size: number;
}

interface ModrinthPluginVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  version_type: 'release' | 'beta' | 'alpha';
  loaders: string[];
  date_published?: string;
  files: ModrinthPluginFile[];
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

const COMMON_LOADERS = [
  { label: 'All Loaders', value: 'all' },
  { label: 'Paper', value: 'paper' },
  { label: 'Purpur', value: 'purpur' },
  { label: 'Spigot', value: 'spigot' },
  { label: 'Velocity', value: 'velocity' },
  { label: 'BungeeCord', value: 'bungeecord' },
  { label: 'Folia', value: 'folia' },
  { label: 'Fabric', value: 'fabric' },
];

const COMMON_VERSIONS = [
  { label: 'All MC Versions', value: 'all' },
  { label: '1.21.4', value: '1.21.4' },
  { label: '1.21.1', value: '1.21.1' },
  { label: '1.20.4', value: '1.20.4' },
  { label: '1.20.1', value: '1.20.1' },
  { label: '1.19.4', value: '1.19.4' },
  { label: '1.18.2', value: '1.18.2' },
  { label: '1.16.5', value: '1.16.5' },
  { label: '1.12.2', value: '1.12.2' },
  { label: '1.8.8', value: '1.8.8' },
];

const SORT_OPTIONS = [
  { label: 'Most Downloads', value: 'downloads' },
  { label: 'Relevance', value: 'relevance' },
  { label: 'Recently Updated', value: 'updated' },
  { label: 'Newest', value: 'newest' },
];

export default function PluginInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  // Tabs: 'browse' | 'installed'
  const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [selectedLoader, setSelectedLoader] = useState<string>('all');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [availableGameVersions, setAvailableGameVersions] = useState<string[]>([]);
  const [selectedSort, setSelectedSort] = useState<string>('downloads');
  const [page, setPage] = useState<number>(1);
  const pageSize = 21;

  // Catalog Data State
  const [plugins, setPlugins] = useState<ModrinthPluginHit[]>([]);
  const [totalHits, setTotalHits] = useState<number>(0);
  const [loadingPlugins, setLoadingPlugins] = useState<boolean>(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Installed Plugins State
  const [installedFiles, setInstalledFiles] = useState<PteroFileItem[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState<boolean>(false);
  const [uninstallingFile, setUninstallingFile] = useState<string | null>(null);

  // Modal State
  const [installModalOpen, setInstallModalOpen] = useState<boolean>(false);
  const [activePlugin, setActivePlugin] = useState<ModrinthPluginHit | null>(null);
  const [versions, setVersions] = useState<ModrinthPluginVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Modal Filters
  const [modalLoader, setModalLoader] = useState<string>('all');
  const [modalGameVersion, setModalGameVersion] = useState<string>('all');
  const [modalType, setModalType] = useState<'all' | 'release' | 'beta' | 'alpha'>('all');

  // Single Plugin Install State
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installedVersions, setInstalledVersions] = useState<Record<string, boolean>>({});
  const [installNotice, setInstallNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Helpers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
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
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  // Fetch dynamic game version tags
  useEffect(() => {
    let isMounted = true;
    http.get<GameVersionTag[]>(`/api/client/servers/${uuid}/plugins/tags`)
      .then((res) => {
        if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
          const list = res.data.map((item) => item.version).slice(0, 30);
          setAvailableGameVersions(list);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [uuid]);

  // Fetch installed plugins from /plugins directory
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

    http.get<Array<{ name: string; size: number; modified_at?: string }>>(
      `/api/client/servers/${uuid}/plugins/installed`
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
          http.get(`/api/client/servers/${uuid}/files/list`, {
            params: { directory: '/plugins' },
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
        http.get(`/api/client/servers/${uuid}/files/list`, {
          params: { directory: '/plugins' },
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

  useEffect(() => {
    fetchInstalledPlugins();
  }, [fetchInstalledPlugins]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch plugins catalog
  const fetchPlugins = useCallback(async () => {
    setLoadingPlugins(true);
    setCatalogError(null);

    try {
      const res = await http.get(`/api/client/servers/${uuid}/plugins`, {
        params: {
          query: debouncedQuery,
          loader: selectedLoader,
          game_version: selectedVersion,
          sort_by: selectedSort,
          page,
          limit: pageSize,
        },
      });

      const data = res.data;
      if (data && Array.isArray(data.hits)) {
        setPlugins(data.hits);
        setTotalHits(data.total_hits || 0);
      } else if (Array.isArray(data)) {
        setPlugins(data);
        setTotalHits(data.length);
      } else {
        setPlugins([]);
        setTotalHits(0);
      }
    } catch (err: unknown) {
      setCatalogError(httpErrorToHuman(err) || 'Failed to load plugins from Modrinth.');
      setPlugins([]);
      setTotalHits(0);
    } finally {
      setLoadingPlugins(false);
    }
  }, [uuid, debouncedQuery, selectedLoader, selectedVersion, selectedSort, page]);

  useEffect(() => {
    if (activeTab === 'browse') {
      fetchPlugins();
    }
  }, [activeTab, fetchPlugins]);

  // Open Install / Version Selection Modal
  const openInstallModal = async (plugin: ModrinthPluginHit) => {
    setActivePlugin(plugin);
    setInstallModalOpen(true);
    setLoadingVersions(true);
    setVersionError(null);
    setVersions([]);
    setInstallNotice(null);

    setModalLoader(selectedLoader !== 'all' ? selectedLoader : 'all');
    setModalGameVersion(selectedVersion !== 'all' ? selectedVersion : 'all');
    setModalType('all');

    const pluginId = plugin.project_id || plugin.id || plugin.slug;

    try {
      const res = await http.get<ModrinthPluginVersion[]>(`/api/client/servers/${uuid}/plugins/versions`, {
        params: { plugin: pluginId },
      });

      if (Array.isArray(res.data)) {
        setVersions(res.data);
      } else {
        setVersions([]);
      }
    } catch (err: unknown) {
      setVersionError(httpErrorToHuman(err) || 'Failed to fetch versions for this plugin.');
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Single version install
  const handleInstallVersion = async (ver: ModrinthPluginVersion) => {
    if (!activePlugin) return;

    const file = ver.files?.find((f) => f.primary) || ver.files?.[0];
    if (!file || !file.url) {
      setInstallNotice({ success: false, message: 'No valid download file found for this version.' });
      return;
    }

    setInstallingVersionId(ver.id);
    setInstallNotice(null);

    try {
      const res = await http.post<{ success: boolean; message?: string }>(
        `/api/client/servers/${uuid}/plugins/install`,
        {
          url: file.url,
          filename: file.filename,
        }
      );

      setInstalledVersions((prev) => ({ ...prev, [ver.id]: true }));
      setInstallNotice({
        success: true,
        message: res.data.message || `Plugin ${file.filename} was installed successfully!`,
      });
      fetchInstalledPlugins();
    } catch (err: unknown) {
      setInstallNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Failed to install plugin file to server.',
      });
    } finally {
      setInstallingVersionId(null);
    }
  };

  // Uninstall a plugin file
  const handleUninstallFile = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename} from /plugins?`)) {
      return;
    }

    setUninstallingFile(filename);

    try {
      await http.post(`/api/client/servers/${uuid}/plugins/delete`, { filename });
      setInstalledFiles((prev) => prev.filter((f) => f.name !== filename));
    } catch (err: unknown) {
      alert(httpErrorToHuman(err) || `Failed to delete ${filename}.`);
    } finally {
      setUninstallingFile(null);
    }
  };

  // Check if a plugin hit matches an installed file on server
  const getInstalledFile = (plugin: ModrinthPluginHit): PteroFileItem | undefined => {
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

  // Modal filtered versions
  const filteredVersions = versions.filter((v) => {
    if (modalType !== 'all' && v.version_type !== modalType) return false;
    if (modalLoader !== 'all' && !v.loaders?.includes(modalLoader)) return false;
    if (modalGameVersion !== 'all' && !v.game_versions?.includes(modalGameVersion)) return false;
    return true;
  });

  const availableModalLoaders = Array.from(new Set(versions.flatMap((v) => v.loaders || []))).sort();
  const availableModalVersions = Array.from(new Set(versions.flatMap((v) => v.game_versions || []))).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  );

  return (
    <ServerContentBlock title={'Minecraft Plugins Installer'}>
      <div className={'my-6'}>
        {/* Header Section */}
        <div className={'flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6'}>
          <div>
            <h1 className={'text-2xl font-bold text-neutral-100 flex items-center gap-3'}>
              <FontAwesomeIcon icon={faPuzzlePiece} className={'text-cyan-400 text-2xl'} />
              Minecraft Plugins Installer
            </h1>
            <p className={'text-sm text-neutral-400 mt-1'}>
              Discover and install Paper, Purpur, Spigot, Velocity, BungeeCord, and Folia plugins directly from Modrinth.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className={'flex items-center gap-2 bg-neutral-800/80 p-1.5 rounded-xl border border-neutral-700/60'}>
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'browse'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FontAwesomeIcon icon={faPuzzlePiece} />
              Browse Plugins
            </button>
            <button
              onClick={() => {
                setActiveTab('installed');
                fetchInstalledPlugins();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'installed'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FontAwesomeIcon icon={faCheck} />
              Installed Plugins
              {installedFiles.length > 0 && (
                <span className={'ml-1 px-1.5 py-0.5 text-xs bg-emerald-500/30 text-emerald-300 rounded-full font-mono'}>
                  {installedFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* BROWSE TAB */}
        {activeTab === 'browse' && (
          <>
            {/* Search & Filter Bar */}
            <div className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 rounded-xl p-4 mb-6 shadow-xl'}>
              <div className={'grid grid-cols-1 md:grid-cols-12 gap-3'}>
                {/* Search Input */}
                <div className={'md:col-span-5 relative'}>
                  <FontAwesomeIcon
                    icon={faSearch}
                    className={'absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm'}
                  />
                  <input
                    type={'text'}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder={'Search plugins (e.g. EssentialsX, LuckPerms, Vault)...'}
                    className={'w-full pl-10 pr-9 py-2.5 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-100 text-sm placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition-colors'}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setPage(1);
                      }}
                      className={'absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200'}
                    >
                      <FontAwesomeIcon icon={faTimes} className={'text-sm'} />
                    </button>
                  )}
                </div>

                {/* Platform / Server Loader Dropdown */}
                <div className={'md:col-span-2'}>
                  <select
                    value={selectedLoader}
                    onChange={(e) => {
                      setSelectedLoader(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    {COMMON_LOADERS.map((ldr) => (
                      <option key={ldr.value} value={ldr.value}>
                        {ldr.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Minecraft Version Dropdown */}
                <div className={'md:col-span-2'}>
                  <select
                    value={selectedVersion}
                    onChange={(e) => {
                      setSelectedVersion(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    {COMMON_VERSIONS.map((ver) => (
                      <option key={ver.value} value={ver.value}>
                        {ver.label}
                      </option>
                    ))}
                    {availableGameVersions
                      .filter((v) => !COMMON_VERSIONS.some((cv) => cv.value === v))
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Sort Dropdown */}
                <div className={'md:col-span-3'}>
                  <select
                    value={selectedSort}
                    onChange={(e) => {
                      setSelectedSort(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    {SORT_OPTIONS.map((srt) => (
                      <option key={srt.value} value={srt.value}>
                        {srt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {catalogError && (
              <div className={'p-4 bg-red-900/40 border border-red-500/40 rounded-xl text-red-200 text-sm mb-6 flex items-center justify-between'}>
                <div className={'flex items-center gap-3'}>
                  <FontAwesomeIcon icon={faExclamationTriangle} className={'text-red-400'} />
                  <span>{catalogError}</span>
                </div>
                <button
                  onClick={fetchPlugins}
                  className={'px-3 py-1 bg-red-800/60 hover:bg-red-700/60 rounded text-xs font-medium text-white transition-colors'}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading Spinner */}
            {loadingPlugins ? (
              <div className={'flex flex-col items-center justify-center py-24 text-neutral-400 gap-3'}>
                <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-cyan-400'} />
                <span className={'text-sm font-medium'}>Searching verified plugins on Modrinth...</span>
              </div>
            ) : plugins.length === 0 ? (
              <div className={'text-center py-20 bg-neutral-800/40 border border-neutral-700/40 rounded-xl text-neutral-400'}>
                <FontAwesomeIcon icon={faPuzzlePiece} className={'text-4xl text-neutral-600 mb-3'} />
                <p className={'text-base font-semibold text-neutral-300'}>No plugins found</p>
                <p className={'text-sm text-neutral-500 mt-1'}>Try adjusting your search terms or loader filters.</p>
              </div>
            ) : (
              /* Plugins Card Grid */
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'}>
                {plugins.map((plugin) => {
                  const installedMatch = getInstalledFile(plugin);
                  const isPluginInstalled = !!installedMatch;
                  const cardId = plugin.project_id || plugin.id || plugin.slug;

                  return (
                    <div
                      key={cardId}
                      className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 hover:border-cyan-500/50 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/10'}
                    >
                      <div>
                        {/* Card Header: Icon & Titles */}
                        <div className={'flex items-start gap-4 mb-3'}>
                          {plugin.icon_url ? (
                            <img
                              src={plugin.icon_url}
                              alt={plugin.title}
                              className={'w-14 h-14 rounded-xl object-cover bg-neutral-900/60 border border-neutral-700/60 shrink-0'}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className={'w-14 h-14 rounded-xl bg-neutral-900/80 border border-neutral-700/60 flex items-center justify-center text-cyan-400 text-xl shrink-0'}>
                              <FontAwesomeIcon icon={faLayerGroup} />
                            </div>
                          )}

                          <div className={'flex-1 min-w-0'}>
                            <h3 className={'font-bold text-neutral-100 text-base leading-snug truncate'}>
                              {plugin.title}
                            </h3>
                            <p className={'text-xs text-neutral-400 mt-0.5'}>by {plugin.author}</p>
                            <div className={'flex items-center gap-3 text-xs text-neutral-400 mt-1'}>
                              <span>
                                <FontAwesomeIcon icon={faDownload} className={'text-cyan-400 mr-1 text-[10px]'} />
                                {formatNumber(plugin.downloads || 0)}
                              </span>
                              <span>★ {formatNumber(plugin.follows || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className={'text-xs text-neutral-300 line-clamp-2 mb-3 leading-relaxed'}>
                          {plugin.description}
                        </p>

                        {/* Categories / Tags */}
                        {Array.isArray(plugin.categories) && plugin.categories.length > 0 && (
                          <div className={'flex flex-wrap gap-1.5 mb-4'}>
                            {plugin.categories.slice(0, 4).map((cat) => (
                              <span
                                key={cat}
                                className={'px-2 py-0.5 bg-neutral-900/80 border border-neutral-700/60 text-neutral-300 text-[11px] rounded-md font-medium capitalize'}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div className={'pt-3 border-t border-neutral-700/40 flex items-center justify-between gap-2'}>
                        {isPluginInstalled ? (
                          <div className={'flex items-center justify-between w-full'}>
                            <span className={'inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-lg'}>
                              <FontAwesomeIcon icon={faCheck} />
                              Installed
                            </span>
                            <div className={'flex items-center gap-2'}>
                              <button
                                onClick={() => openInstallModal(plugin)}
                                className={'px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 text-xs font-medium rounded-lg transition-colors'}
                              >
                                Versions
                              </button>
                              {installedMatch && (
                                <button
                                  onClick={() => handleUninstallFile(installedMatch.name)}
                                  disabled={uninstallingFile === installedMatch.name}
                                  className={'p-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-300 text-xs rounded-lg transition-colors'}
                                  title={`Delete ${installedMatch.name}`}
                                >
                                  <FontAwesomeIcon icon={uninstallingFile === installedMatch.name ? faSpinner : faTrash} spin={uninstallingFile === installedMatch.name} />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openInstallModal(plugin)}
                            className={'w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2'}
                          >
                            <FontAwesomeIcon icon={faDownload} />
                            Install Plugin
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalHits > pageSize && (
              <div className={'flex items-center justify-between mt-8 pt-4 border-t border-neutral-700/60 text-sm text-neutral-400'}>
                <span>
                  Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalHits)} of {totalHits} plugins
                </span>
                <div className={'flex items-center gap-2'}>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={'px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700'}
                  >
                    Previous
                  </button>
                  <span className={'px-3 py-1 text-xs font-mono text-neutral-300'}>Page {page}</span>
                  <button
                    disabled={page * pageSize >= totalHits}
                    onClick={() => setPage((p) => p + 1)}
                    className={'px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700'}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* INSTALLED TAB */}
        {activeTab === 'installed' && (
          <div>
            <div className={'flex items-center justify-between mb-4'}>
              <div>
                <h3 className={'text-lg font-bold text-neutral-100'}>Installed Plugins</h3>
                <p className={'text-xs text-neutral-400'}>Showing all .jar and .zip plugin files in /plugins</p>
              </div>
              <button
                onClick={fetchInstalledPlugins}
                disabled={loadingInstalled}
                className={'px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 transition-colors flex items-center gap-1.5'}
              >
                <FontAwesomeIcon icon={faSpinner} spin={loadingInstalled} className={loadingInstalled ? 'text-cyan-400' : ''} />
                Refresh
              </button>
            </div>

            {loadingInstalled ? (
              <div className={'flex flex-col items-center justify-center py-20 text-neutral-400 gap-3'}>
                <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-cyan-400'} />
                <span className={'text-sm'}>Scanning /plugins directory...</span>
              </div>
            ) : installedFiles.length === 0 ? (
              <div className={'text-center py-20 bg-neutral-800/40 border border-neutral-700/40 rounded-xl text-neutral-400'}>
                <FontAwesomeIcon icon={faFolderOpen} className={'text-4xl text-neutral-600 mb-3'} />
                <p className={'text-base font-semibold text-neutral-300'}>No plugins currently installed in /plugins</p>
                <p className={'text-sm text-neutral-500 mt-1'}>
                  Browse the catalog and install plugins directly to your server.
                </p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className={'mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors'}
                >
                  Browse Plugins
                </button>
              </div>
            ) : (
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
                {installedFiles.map((file) => (
                  <div
                    key={file.name}
                    className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 rounded-xl p-4 flex items-center justify-between gap-3 shadow-sm hover:border-neutral-600 transition-colors'}
                  >
                    <div className={'flex items-center gap-3 min-w-0'}>
                      <div className={'w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0'}>
                        <FontAwesomeIcon icon={faPuzzlePiece} />
                      </div>
                      <div className={'min-w-0'}>
                        <p className={'text-xs font-bold text-neutral-100 truncate'} title={file.name}>
                          {file.name}
                        </p>
                        <p className={'text-[11px] text-neutral-400'}>
                          {formatSize(file.size)} {file.modifiedAt ? `• ${formatTimeAgo(file.modifiedAt)}` : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUninstallFile(file.name)}
                      disabled={uninstallingFile === file.name}
                      className={'p-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 text-xs rounded-lg transition-colors shrink-0'}
                      title={`Delete ${file.name}`}
                    >
                      <FontAwesomeIcon icon={uninstallingFile === file.name ? faSpinner : faTrash} spin={uninstallingFile === file.name} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VERSION SELECTOR MODAL */}
        {installModalOpen && activePlugin && (
          <div className={'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm'}>
            <div className={'bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden'}>
              {/* Modal Header */}
              <div className={'flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0'}>
                <div className={'flex items-center gap-2.5 min-w-0'}>
                  {activePlugin.icon_url ? (
                    <img src={activePlugin.icon_url} alt={activePlugin.title} className={'w-8 h-8 rounded-lg object-cover shrink-0'} />
                  ) : (
                    <div className={'w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-cyan-400 shrink-0'}>
                      <FontAwesomeIcon icon={faPuzzlePiece} className={'text-sm'} />
                    </div>
                  )}
                  <div className={'min-w-0'}>
                    <h3 className={'text-sm font-bold text-neutral-100 truncate'}>{activePlugin.title}</h3>
                    <p className={'text-[11px] text-neutral-400'}>Select Version to Install</p>
                  </div>
                </div>

                <button
                  onClick={() => setInstallModalOpen(false)}
                  className={'p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded-lg'}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              {/* Toast / Notice */}
              {installNotice && (
                <div className={`px-4 py-2 text-xs flex items-center justify-between ${
                  installNotice.success
                    ? 'bg-emerald-500/20 text-emerald-300 border-b border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border-b border-red-500/30'
                }`}>
                  <span>{installNotice.message}</span>
                  <button onClick={() => setInstallNotice(null)} className={'text-xs opacity-70 hover:opacity-100'}>
                    ✕
                  </button>
                </div>
              )}

              {/* Filter Row inside Modal */}
              <div className={'p-3 bg-neutral-950/60 border-b border-neutral-800/80 grid grid-cols-3 gap-2 shrink-0'}>
                {/* Loader Filter */}
                <select
                  value={modalLoader}
                  onChange={(e) => setModalLoader(e.target.value)}
                  className={'py-1.5 px-2 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                >
                  <option value={'all'}>All Loaders</option>
                  {availableModalLoaders.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>

                {/* MC Version Filter */}
                <select
                  value={modalGameVersion}
                  onChange={(e) => setModalGameVersion(e.target.value)}
                  className={'py-1.5 px-2 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                >
                  <option value={'all'}>All Versions</option>
                  {availableModalVersions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                {/* Release Type Filter */}
                <select
                  value={modalType}
                  onChange={(e) => setModalType(e.target.value as any)}
                  className={'py-1.5 px-2 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                >
                  <option value={'all'}>All Channels</option>
                  <option value={'release'}>Release Only</option>
                  <option value={'beta'}>Beta</option>
                  <option value={'alpha'}>Alpha</option>
                </select>
              </div>

              {/* Modal Body: Versions List */}
              <div className={'p-4 space-y-2.5 overflow-y-auto max-h-[55vh]'}>
                {loadingVersions ? (
                  <div className={'py-12 flex flex-col items-center justify-center text-neutral-400 gap-2'}>
                    <FontAwesomeIcon icon={faSpinner} spin className={'text-2xl text-cyan-400'} />
                    <span className={'text-xs'}>Fetching compatible versions...</span>
                  </div>
                ) : versionError ? (
                  <div className={'p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-red-200 text-xs'}>
                    {versionError}
                  </div>
                ) : filteredVersions.length === 0 ? (
                  <p className={'text-center text-xs text-neutral-400 py-10'}>
                    No versions match the selected filters.
                  </p>
                ) : (
                  filteredVersions.map((ver) => {
                    const primaryFile = ver.files?.find((f) => f.primary) || ver.files?.[0];
                    const isInstalled = installedVersions[ver.id];
                    const isInstalling = installingVersionId === ver.id;

                    const typeBadgeColor =
                      ver.version_type === 'release'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : ver.version_type === 'beta'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30';

                    return (
                      <div
                        key={ver.id}
                        className={'bg-neutral-800/60 border border-neutral-700/70 hover:border-neutral-600 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors'}
                      >
                        <div className={'min-w-0 flex-1'}>
                          <div className={'flex items-center gap-2 flex-wrap'}>
                            <span className={'text-xs font-bold text-neutral-100 truncate'}>
                              {ver.version_number || ver.name}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] rounded border uppercase font-mono font-semibold ${typeBadgeColor}`}>
                              {ver.version_type}
                            </span>
                          </div>

                          <div className={'flex items-center gap-2 text-[11px] text-neutral-400 mt-1 flex-wrap'}>
                            <span>
                              MC: {Array.isArray(ver.game_versions) ? ver.game_versions.slice(0, 3).join(', ') : 'All'}
                              {ver.game_versions && ver.game_versions.length > 3 ? '...' : ''}
                            </span>
                            <span>•</span>
                            <span>{Array.isArray(ver.loaders) ? ver.loaders.join(', ').toUpperCase() : 'PLUGIN'}</span>
                            {primaryFile && (
                              <>
                                <span>•</span>
                                <span>{formatSize(primaryFile.size)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Install Button */}
                        <button
                          onClick={() => handleInstallVersion(ver)}
                          disabled={isInstalling || !primaryFile}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                            isInstalled
                              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20'
                          }`}
                        >
                          {isInstalling ? (
                            <>
                              <FontAwesomeIcon icon={faSpinner} spin className={'text-xs'} />
                              Installing...
                            </>
                          ) : isInstalled ? (
                            <>
                              <FontAwesomeIcon icon={faCheck} />
                              Installed
                            </>
                          ) : (
                            <>
                              <FontAwesomeIcon icon={faDownload} />
                              Install
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className={'px-4 py-3 bg-neutral-950/60 border-t border-neutral-800 flex items-center justify-end shrink-0'}>
                <button
                  onClick={() => setInstallModalOpen(false)}
                  className={'px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors'}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
