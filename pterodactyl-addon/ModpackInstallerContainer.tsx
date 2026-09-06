import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBoxes,
  faDownload,
  faSpinner,
  faTrash,
  faCheck,
  faExclamationTriangle,
  faSearch,
  faTimes,
  faLayerGroup,
  faFolderOpen,
  faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';

interface ModpackHit {
  project_id: string;
  id?: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side?: string;
  server_side?: string;
  icon_url: string | null;
  color?: string | null;
  author: string;
  downloads: number;
  follows: number;
  versions: string[];
  latest_version?: string | null;
}

interface ModpackVersionFile {
  filename: string;
  url: string;
  size: number;
  primary?: boolean;
}

interface ModpackVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published?: string | null;
  downloads?: number;
  files?: ModpackVersionFile[];
}

interface ModpackManifest {
  project_id: string;
  title: string;
  version_id: string;
  version_name: string;
  loader: string;
  minecraft: string;
  icon_url?: string;
  installed_at: string;
  total_mods: number;
  installed_files?: string[];
}

interface PrepareResponse {
  success: boolean;
  version_id: string;
  game_version: string;
  loader: string;
  total_files: number;
  files: Array<{
    name: string;
    path: string;
    directory: string;
    filename: string;
    url: string;
    size: number;
  }>;
  overrides_extracted: number;
}

const COMMON_LOADERS = [
  { value: '', label: 'All Loaders' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'forge', label: 'Forge' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'quilt', label: 'Quilt' },
];

const COMMON_VERSIONS = [
  { value: '', label: 'All MC Versions' },
  { value: '1.21.4', label: '1.21.4' },
  { value: '1.21.1', label: '1.21.1' },
  { value: '1.20.6', label: '1.20.6' },
  { value: '1.20.4', label: '1.20.4' },
  { value: '1.20.1', label: '1.20.1' },
  { value: '1.19.4', label: '1.19.4' },
  { value: '1.19.2', label: '1.19.2' },
  { value: '1.18.2', label: '1.18.2' },
  { value: '1.16.5', label: '1.16.5' },
  { value: '1.12.2', label: '1.12.2' },
];

const SORT_OPTIONS = [
  { value: 'downloads', label: 'Most Downloads' },
  { value: 'relevance', label: 'Relevance' },
  { value: 'follows', label: 'Most Followed' },
  { value: 'newest', label: 'Newest' },
  { value: 'updated', label: 'Recently Updated' },
];

export default function ModpackInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  const [activeTab, setActiveTab] = useState<'catalog' | 'installed'>('catalog');

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLoader, setSelectedLoader] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSort, setSelectedSort] = useState<string>('downloads');
  const [page, setPage] = useState<number>(1);

  // Catalog State
  const [modpacks, setModpacks] = useState<ModpackHit[]>([]);
  const [loadingModpacks, setLoadingModpacks] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [totalHits, setTotalHits] = useState<number>(0);

  // Category tags from API
  const [categories, setCategories] = useState<Array<{ name: string; header?: string }>>([]);

  // Installed Modpack Manifest State
  const [installedManifest, setInstalledManifest] = useState<ModpackManifest | null>(null);
  const [loadingInstalled, setLoadingInstalled] = useState<boolean>(false);
  const [uninstalling, setUninstalling] = useState<boolean>(false);

  // Modal / Install Process State
  const [installModalOpen, setInstallModalOpen] = useState<boolean>(false);
  const [activeModpack, setActiveModpack] = useState<ModpackHit | null>(null);
  const [modpackVersions, setModpackVersions] = useState<ModpackVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [wipeMode, setWipeMode] = useState<'mods_and_configs' | 'full_server' | 'none'>('mods_and_configs');

  // Step-by-Step Installation Tracking
  const [installPhase, setInstallPhase] = useState<'idle' | 'preparing' | 'downloading' | 'finalizing' | 'success' | 'error'>('idle');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [processedFiles, setProcessedFiles] = useState<number>(0);
  const [totalFilesToProcess, setTotalFilesToProcess] = useState<number>(0);
  const [installError, setInstallError] = useState<string | null>(null);

  // 1. Fetch Installed Modpack Manifest
  const fetchInstalledManifest = useCallback(() => {
    setLoadingInstalled(true);
    http.get<{ has_modpack: boolean; manifest: ModpackManifest | null }>(
      `/api/client/servers/${uuid}/modpacks/installed`
    )
      .then((res) => {
        if (res.data && res.data.has_modpack && res.data.manifest) {
          setInstalledManifest(res.data.manifest);
        } else {
          setInstalledManifest(null);
        }
      })
      .catch(() => {
        setInstalledManifest(null);
      })
      .finally(() => {
        setLoadingInstalled(false);
      });
  }, [uuid]);

  useEffect(() => {
    fetchInstalledManifest();
  }, [fetchInstalledManifest]);

  // 2. Fetch Categories
  useEffect(() => {
    http.get<Array<{ name: string; header?: string }>>(`/api/client/servers/${uuid}/modpacks/categories`)
      .then((res) => {
        if (res.data && Array.isArray(res.data)) {
          setCategories(res.data);
        }
      })
      .catch(() => {});
  }, [uuid]);

  // 3. Search & Fetch Modpack Catalog
  const fetchCatalog = useCallback(() => {
    setLoadingModpacks(true);
    setCatalogError(null);

    http.get<{ hits: ModpackHit[]; total_hits: number }>(
      `/api/client/servers/${uuid}/modpacks`,
      {
        params: {
          query: searchQuery.trim(),
          loader: selectedLoader,
          version: selectedVersion,
          category: selectedCategory,
          sort: selectedSort,
          page,
          limit: 20,
        },
      }
    )
      .then((res) => {
        const hits = res.data?.hits || (res.data as any)?.modpacks || [];
        const total = res.data?.total_hits ?? (res.data as any)?.total ?? 0;
        if (Array.isArray(hits)) {
          setModpacks(hits);
          setTotalHits(total);
        } else {
          setModpacks([]);
          setTotalHits(0);
        }
      })
      .catch((err: unknown) => {
        setCatalogError(httpErrorToHuman(err) || 'Failed to load modpacks.');
      })
      .finally(() => {
        setLoadingModpacks(false);
      });
  }, [uuid, searchQuery, selectedLoader, selectedVersion, selectedCategory, selectedSort, page]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCatalog();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchCatalog]);

  // 4. Open Install Modal & Load Versions
  const openInstallModal = (modpack: ModpackHit) => {
    const projectId = modpack.project_id || modpack.id || modpack.slug;
    setActiveModpack(modpack);
    setInstallModalOpen(true);
    setModpackVersions([]);
    setSelectedVersionId('');
    setLoadingVersions(true);
    setInstallPhase('idle');
    setProgressPercent(0);
    setProgressMessage('');
    setProcessedFiles(0);
    setTotalFilesToProcess(0);
    setInstallError(null);
    setWipeMode('mods_and_configs');

    http.get<ModpackVersion[]>(`/api/client/servers/${uuid}/modpacks/versions`, {
      params: {
        project_id: projectId,
        loader: selectedLoader,
        version: selectedVersion,
      },
    })
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : (res.data as any)?.versions || [];
        if (Array.isArray(list)) {
          setModpackVersions(list);
          if (list.length > 0) {
            setSelectedVersionId(list[0].id);
          }
        }
      })
      .catch((err: unknown) => {
        setInstallError(httpErrorToHuman(err) || 'Failed to load modpack versions.');
      })
      .finally(() => {
        setLoadingVersions(false);
      });
  };

  // 5. Execute Modpack Installation (Chunked Batch Stepper)
  const startInstallation = async () => {
    if (!activeModpack || !selectedVersionId) return;

    setInstallPhase('preparing');
    setProgressPercent(5);
    setProgressMessage('Downloading modpack archive & preparing files...');
    setInstallError(null);

    const chosenVersion = modpackVersions.find((v) => v.id === selectedVersionId);
    const projectId = activeModpack.project_id || activeModpack.id || activeModpack.slug;

    try {
      // Step 1: Prepare (allow up to 5 mins for downloading large .mrpack archives and extracting overrides)
      const prepRes = await http.post<PrepareResponse>(
        `/api/client/servers/${uuid}/modpacks/prepare`,
        {
          version_id: selectedVersionId,
          wipe_mode: wipeMode,
        },
        { timeout: 300000 }
      );

      const prepData = prepRes.data;
      if (!prepData || !prepData.success) {
        throw new Error('Failed to prepare modpack archive.');
      }

      const files = prepData.files || [];
      const totalMods = files.length;
      setTotalFilesToProcess(totalMods);

      if (totalMods === 0) {
        setProgressPercent(90);
        setProgressMessage('Configs extracted. No additional server mods required.');
      } else {
        setInstallPhase('downloading');
        setProgressPercent(15);
        setProgressMessage(`Found ${totalMods} server mods. Downloading files...`);

        // Batch download: 3 files at a time to ensure low latency and zero PHP timeouts
        const BATCH_SIZE = 3;
        const installedList: string[] = [];

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          const batch = files.slice(i, i + BATCH_SIZE);

          const currentCount = Math.min(i + batch.length, totalMods);
          setProcessedFiles(currentCount);

          const pct = Math.round(15 + ((currentCount / totalMods) * 75));
          setProgressPercent(pct);
          setProgressMessage(`Installing mods (${currentCount}/${totalMods}): ${batch[0].filename}...`);

          const batchRes = await http.post<{ success: boolean; installed_files: string[] }>(
            `/api/client/servers/${uuid}/modpacks/install-batch`,
            { files: batch },
            { timeout: 180000 }
          );

          if (batchRes.data && Array.isArray(batchRes.data.installed_files)) {
            installedList.push(...batchRes.data.installed_files);
          }
        }
      }

      // Step 3: Finalize
      setInstallPhase('finalizing');
      setProgressPercent(95);
      setProgressMessage('Finalizing modpack manifest...');

      await http.post(
        `/api/client/servers/${uuid}/modpacks/finalize`,
        {
          project_id: projectId,
          title: activeModpack.title,
          version_id: selectedVersionId,
          version_name: chosenVersion?.version_number || chosenVersion?.name || 'Latest',
          loader: prepData.loader || chosenVersion?.loaders?.[0] || 'modded',
          minecraft: prepData.game_version || chosenVersion?.game_versions?.[0] || 'Unknown',
          icon_url: activeModpack.icon_url || '',
          total_mods: files.length,
          installed_files: files.map((f) => f.path),
        },
        { timeout: 60000 }
      );

      setProgressPercent(100);
      setInstallPhase('success');
      setProgressMessage('Modpack installed successfully! Remember to restart your server.');
      fetchInstalledManifest();
    } catch (err: unknown) {
      setInstallPhase('error');
      setInstallError(httpErrorToHuman(err) || 'Installation encountered an unexpected error.');
    }
  };

  // 6. Uninstall Active Modpack
  const handleUninstall = () => {
    if (!confirm('Are you sure you want to uninstall this modpack? This will clear installed mods.')) {
      return;
    }

    setUninstalling(true);
    http.post(`/api/client/servers/${uuid}/modpacks/uninstall`, { wipe_mods: true }, { timeout: 120000 })
      .then(() => {
        setInstalledManifest(null);
        fetchInstalledManifest();
      })
      .catch((err: unknown) => {
        alert(httpErrorToHuman(err) || 'Failed to uninstall modpack.');
      })
      .finally(() => {
        setUninstalling(false);
      });
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const isInstalled = (modpack: ModpackHit): boolean => {
    const id = modpack.project_id || modpack.id || modpack.slug;
    return installedManifest?.project_id === id;
  };

  return (
    <ServerContentBlock title={'Minecraft Modpacks Installer'}>
      <div className={'my-6'}>
        {/* Header Section */}
        <div className={'flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6'}>
          <div>
            <h1 className={'text-2xl font-bold text-neutral-100 flex items-center gap-3'}>
              <FontAwesomeIcon icon={faBoxes} className={'text-cyan-400 text-2xl'} />
              Minecraft Modpacks Installer
            </h1>
            <p className={'text-sm text-neutral-400 mt-1'}>
              Browse and install complete Minecraft modpacks from Modrinth with automatic configurations and overrides.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className={'flex items-center gap-2 bg-neutral-800/80 p-1.5 rounded-xl border border-neutral-700/60'}>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'catalog'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FontAwesomeIcon icon={faBoxes} />
              Browse Modpacks
            </button>
            <button
              onClick={() => {
                setActiveTab('installed');
                fetchInstalledManifest();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'installed'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FontAwesomeIcon icon={faCheck} />
              Installed Modpack
              {installedManifest && (
                <span className={'ml-1 px-1.5 py-0.5 text-xs bg-emerald-500/30 text-emerald-300 rounded-full font-mono'}>
                  1
                </span>
              )}
            </button>
          </div>
        </div>

        {/* CATALOG TAB */}
        {activeTab === 'catalog' && (
          <>
            {/* Search & Filter Bar */}
            <div className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 rounded-xl p-4 mb-6 shadow-xl'}>
              <div className={'grid grid-cols-1 md:grid-cols-12 gap-3'}>
                {/* Search Input */}
                <div className={'md:col-span-4 relative'}>
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
                    placeholder={'Search modpacks (e.g. Cobblemon, Better MC)...'}
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

                {/* Mod Loader Dropdown */}
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
                  </select>
                </div>

                {/* Category Dropdown */}
                <div className={'md:col-span-2'}>
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    <option value={''}>All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.name} value={cat.name}>
                        {cat.header || (cat.name.charAt(0).toUpperCase() + cat.name.slice(1))}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Dropdown */}
                <div className={'md:col-span-2'}>
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
                  onClick={fetchCatalog}
                  className={'px-3 py-1 bg-red-800/60 hover:bg-red-700/60 rounded text-xs font-medium text-white transition-colors'}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading Spinner */}
            {loadingModpacks ? (
              <div className={'flex flex-col items-center justify-center py-24 text-neutral-400 gap-3'}>
                <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-cyan-400'} />
                <span className={'text-sm font-medium'}>Loading modpacks catalog...</span>
              </div>
            ) : modpacks.length === 0 ? (
              <div className={'text-center py-20 bg-neutral-800/40 border border-neutral-700/40 rounded-xl text-neutral-400'}>
                <FontAwesomeIcon icon={faBoxes} className={'text-4xl text-neutral-600 mb-3'} />
                <p className={'text-base font-semibold text-neutral-300'}>No modpacks found</p>
                <p className={'text-sm text-neutral-500 mt-1'}>Try adjusting your search filters or loader.</p>
              </div>
            ) : (
              /* Modpacks Card Grid */
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'}>
                {modpacks.map((modpack) => {
                  const currentlyInstalled = isInstalled(modpack);
                  const cardId = modpack.project_id || modpack.id || modpack.slug;
                  return (
                    <div
                      key={cardId}
                      className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 hover:border-cyan-500/50 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/10'}
                    >
                      <div>
                        {/* Card Header: Icon & Titles */}
                        <div className={'flex items-start gap-4 mb-3'}>
                          {modpack.icon_url ? (
                            <img
                              src={modpack.icon_url}
                              alt={modpack.title}
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
                              {modpack.title}
                            </h3>
                            <p className={'text-xs text-neutral-400 mt-0.5'}>by {modpack.author}</p>
                            <div className={'flex items-center gap-3 text-xs text-neutral-400 mt-1'}>
                              <span>
                                <FontAwesomeIcon icon={faDownload} className={'text-cyan-400 mr-1 text-[10px]'} />
                                {formatNumber(modpack.downloads || 0)}
                              </span>
                              <span>★ {formatNumber(modpack.follows || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className={'text-xs text-neutral-300 line-clamp-2 mb-3 leading-relaxed'}>
                          {modpack.description}
                        </p>

                        {/* Categories / Tags */}
                        {Array.isArray(modpack.categories) && modpack.categories.length > 0 && (
                          <div className={'flex flex-wrap gap-1.5 mb-4'}>
                            {modpack.categories.slice(0, 4).map((cat) => (
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
                        {currentlyInstalled ? (
                          <div className={'flex items-center justify-between w-full'}>
                            <span className={'inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-lg'}>
                              <FontAwesomeIcon icon={faCheck} />
                              Installed
                            </span>
                            <div className={'flex items-center gap-2'}>
                              <button
                                onClick={() => openInstallModal(modpack)}
                                className={'px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 text-xs font-medium rounded-lg transition-colors'}
                              >
                                Reinstall
                              </button>
                              <button
                                onClick={handleUninstall}
                                disabled={uninstalling}
                                className={'p-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-300 text-xs rounded-lg transition-colors'}
                                title={'Uninstall Modpack'}
                              >
                                <FontAwesomeIcon icon={uninstalling ? faSpinner : faTrash} spin={uninstalling} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openInstallModal(modpack)}
                            className={'w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2'}
                          >
                            <FontAwesomeIcon icon={faDownload} />
                            Install Modpack
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalHits > 20 && (
              <div className={'flex items-center justify-between mt-8 pt-4 border-t border-neutral-700/60 text-sm text-neutral-400'}>
                <span>
                  Showing {((page - 1) * 20) + 1} - {Math.min(page * 20, totalHits)} of {totalHits} modpacks
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
                    disabled={page * 20 >= totalHits}
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
          <div className={'max-w-3xl mx-auto'}>
            {loadingInstalled ? (
              <div className={'flex flex-col items-center justify-center py-20 text-neutral-400 gap-3'}>
                <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-cyan-400'} />
                <span className={'text-sm font-medium'}>Checking installed modpack...</span>
              </div>
            ) : installedManifest ? (
              <div className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 rounded-2xl p-6 shadow-xl'}>
                <div className={'flex items-start justify-between gap-4 pb-6 border-b border-neutral-700/60'}>
                  <div className={'flex items-center gap-4'}>
                    {installedManifest.icon_url ? (
                      <img
                        src={installedManifest.icon_url}
                        alt={installedManifest.title}
                        className={'w-16 h-16 rounded-xl object-cover border border-neutral-700/60'}
                      />
                    ) : (
                      <div className={'w-16 h-16 rounded-xl bg-neutral-900 border border-neutral-700/60 flex items-center justify-center text-cyan-400 text-2xl'}>
                        <FontAwesomeIcon icon={faBoxes} />
                      </div>
                    )}
                    <div>
                      <span className={'px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs font-semibold rounded-md uppercase'}>
                        Active Modpack
                      </span>
                      <h2 className={'text-xl font-bold text-neutral-100 mt-1'}>{installedManifest.title}</h2>
                      <p className={'text-xs text-neutral-400 mt-0.5'}>
                        Version: <span className={'font-mono text-neutral-200'}>{installedManifest.version_name}</span> • Loader: <span className={'font-mono uppercase text-cyan-300'}>{installedManifest.loader}</span> • MC: <span className={'font-mono text-neutral-200'}>{installedManifest.minecraft}</span>
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleUninstall}
                    disabled={uninstalling}
                    className={'px-4 py-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-2'}
                  >
                    <FontAwesomeIcon icon={uninstalling ? faSpinner : faTrash} spin={uninstalling} />
                    Uninstall Modpack
                  </button>
                </div>

                <div className={'grid grid-cols-2 md:grid-cols-3 gap-4 py-5 text-center border-b border-neutral-700/60'}>
                  <div className={'p-3 bg-neutral-900/60 rounded-xl border border-neutral-700/40'}>
                    <p className={'text-xs text-neutral-400'}>Total Mods Installed</p>
                    <p className={'text-lg font-bold text-cyan-400 mt-1 font-mono'}>{installedManifest.total_mods || 0}</p>
                  </div>
                  <div className={'p-3 bg-neutral-900/60 rounded-xl border border-neutral-700/40'}>
                    <p className={'text-xs text-neutral-400'}>Mod Loader</p>
                    <p className={'text-lg font-bold text-neutral-200 mt-1 uppercase font-mono'}>{installedManifest.loader}</p>
                  </div>
                  <div className={'p-3 bg-neutral-900/60 rounded-xl border border-neutral-700/40 col-span-2 md:col-span-1'}>
                    <p className={'text-xs text-neutral-400'}>Installed Date</p>
                    <p className={'text-xs font-medium text-neutral-300 mt-2 font-mono'}>
                      {installedManifest.installed_at ? new Date(installedManifest.installed_at).toLocaleDateString() : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Tracked Files Details */}
                {installedManifest.installed_files && installedManifest.installed_files.length > 0 && (
                  <div className={'mt-5'}>
                    <h4 className={'text-xs font-bold uppercase text-neutral-400 tracking-wider mb-2'}>
                      Installed Files ({installedManifest.installed_files.length})
                    </h4>
                    <div className={'max-h-60 overflow-y-auto bg-neutral-900/80 border border-neutral-700/60 rounded-xl p-3 font-mono text-xs text-neutral-300 space-y-1'}>
                      {installedManifest.installed_files.map((file, idx) => (
                        <div key={idx} className={'truncate text-neutral-400 hover:text-neutral-200'}>
                          • {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className={'text-center py-20 bg-neutral-800/40 border border-neutral-700/40 rounded-xl text-neutral-400'}>
                <FontAwesomeIcon icon={faFolderOpen} className={'text-4xl text-neutral-600 mb-3'} />
                <p className={'text-base font-semibold text-neutral-300'}>No modpack currently installed</p>
                <p className={'text-sm text-neutral-500 mt-1'}>
                  Browse the catalog and install a modpack to see it managed here.
                </p>
                <button
                  onClick={() => setActiveTab('catalog')}
                  className={'mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors'}
                >
                  Browse Modpacks
                </button>
              </div>
            )}
          </div>
        )}

        {/* INSTALLATION MODAL DIALOG */}
        {installModalOpen && activeModpack && (
          <div className={'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm'}>
            <div className={'bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden'}>
              {/* Modal Header */}
              <div className={'flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0'}>
                <div className={'flex items-center gap-2.5 min-w-0'}>
                  {activeModpack.icon_url ? (
                    <img src={activeModpack.icon_url} alt={activeModpack.title} className={'w-8 h-8 rounded-lg object-cover shrink-0'} />
                  ) : (
                    <div className={'w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-cyan-400 shrink-0'}>
                      <FontAwesomeIcon icon={faBoxes} className={'text-sm'} />
                    </div>
                  )}
                  <div className={'min-w-0'}>
                    <h3 className={'text-sm font-bold text-neutral-100 truncate'}>{activeModpack.title}</h3>
                    <p className={'text-[11px] text-neutral-400'}>Install Modpack</p>
                  </div>
                </div>

                {installPhase === 'idle' || installPhase === 'success' || installPhase === 'error' ? (
                  <button
                    onClick={() => setInstallModalOpen(false)}
                    className={'p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded-lg'}
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                ) : null}
              </div>

              {/* Modal Body */}
              <div className={'p-4 space-y-3.5 overflow-y-auto'}>
                {/* IDLE / SETUP VIEW */}
                {installPhase === 'idle' && (
                  <>
                    {/* Version Selector */}
                    <div>
                      <label className={'block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1'}>
                        Select Modpack Version
                      </label>
                      {loadingVersions ? (
                        <div className={'flex items-center gap-2 text-xs text-neutral-400 py-2 px-3 bg-neutral-800/60 rounded-lg border border-neutral-700/60'}>
                          <FontAwesomeIcon icon={faSpinner} spin className={'text-cyan-400'} />
                          Loading versions...
                        </div>
                      ) : modpackVersions.length === 0 ? (
                        <p className={'text-xs text-amber-400 py-1'}>No downloadable versions found.</p>
                      ) : (
                        <select
                          value={selectedVersionId}
                          onChange={(e) => setSelectedVersionId(e.target.value)}
                          className={'w-full py-2 px-3 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                        >
                          {modpackVersions.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.version_number || v.name} ({Array.isArray(v.loaders) ? v.loaders.join(', ').toUpperCase() : 'MODDED'}) - MC {Array.isArray(v.game_versions) ? v.game_versions.join(', ') : 'ALL'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Wipe Options - Compact 3-card grid */}
                    <div>
                      <label className={'block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5'}>
                        Installation Mode
                      </label>
                      <div className={'grid grid-cols-3 gap-2'}>
                        <button
                          type={'button'}
                          onClick={() => setWipeMode('mods_and_configs')}
                          className={`p-2.5 rounded-xl text-center border transition-all text-xs font-semibold ${
                            wipeMode === 'mods_and_configs'
                              ? 'bg-cyan-600/25 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-500/50'
                              : 'bg-neutral-800/60 border-neutral-700/70 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
                          }`}
                        >
                          <span className={'block'}>Clean Mods</span>
                          <span className={'text-[9px] opacity-80 font-normal uppercase tracking-wider'}>Recommended</span>
                        </button>
                        <button
                          type={'button'}
                          onClick={() => setWipeMode('none')}
                          className={`p-2.5 rounded-xl text-center border transition-all text-xs font-semibold ${
                            wipeMode === 'none'
                              ? 'bg-cyan-600/25 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-500/20 ring-1 ring-cyan-500/50'
                              : 'bg-neutral-800/60 border-neutral-700/70 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
                          }`}
                        >
                          <span className={'block'}>Keep All</span>
                          <span className={'text-[9px] opacity-80 font-normal uppercase tracking-wider'}>No wipe</span>
                        </button>
                        <button
                          type={'button'}
                          onClick={() => setWipeMode('full_server')}
                          className={`p-2.5 rounded-xl text-center border transition-all text-xs font-semibold ${
                            wipeMode === 'full_server'
                              ? 'bg-rose-600/25 border-rose-500 text-rose-300 shadow-sm shadow-rose-500/20 ring-1 ring-rose-500/50'
                              : 'bg-neutral-800/60 border-neutral-700/70 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
                          }`}
                        >
                          <span className={'block'}>Wipe Server</span>
                          <span className={'text-[9px] opacity-80 font-normal uppercase tracking-wider'}>Full reset</span>
                        </button>
                      </div>
                      <p className={'text-[11px] text-neutral-400 mt-1.5 px-0.5'}>
                        {wipeMode === 'mods_and_configs' && '✓ Clears /mods & /config to prevent conflicts. Worlds & settings are kept.'}
                        {wipeMode === 'none' && '✓ Merges modpack files with existing files without deleting anything.'}
                        {wipeMode === 'full_server' && '⚠️ Deletes ALL existing server files and starts completely fresh.'}
                      </p>
                    </div>

                    {/* Server Compatibility Notice - Compact hint */}
                    <div className={'px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-[11px] text-neutral-400 flex items-center gap-2'}>
                      <FontAwesomeIcon icon={faBoxes} className={'text-cyan-400 text-xs shrink-0'} />
                      <span>Requires matching server software (Fabric/Forge).</span>
                    </div>
                  </>
                )}

                {/* PROGRESS BAR VIEW */}
                {(installPhase === 'preparing' || installPhase === 'downloading' || installPhase === 'finalizing') && (
                  <div className={'py-3 space-y-3'}>
                    {/* Notice about processing time */}
                    <div className={'px-3 py-2 bg-cyan-500/10 border border-cyan-500/25 rounded-lg flex items-start gap-2.5 text-[11px] text-cyan-200/90'}>
                      <FontAwesomeIcon icon={faInfoCircle} className={'text-cyan-400 text-xs mt-0.5 shrink-0'} />
                      <div className={'min-w-0'}>
                        <span className={'font-semibold text-cyan-300'}>Processing may take longer</span>
                        <p className={'text-[10.5px] text-neutral-300 mt-0.5 leading-relaxed'}>
                          Modpack processing can take longer depending on the modpack size. Please keep this window open while files are being downloaded and extracted.
                        </p>
                      </div>
                    </div>

                    <div className={'flex items-center justify-between text-xs font-medium text-neutral-300'}>
                      <span className={'flex items-center gap-2 truncate'}>
                        <FontAwesomeIcon icon={faSpinner} spin className={'text-cyan-400 shrink-0'} />
                        <span className={'truncate'}>{progressMessage}</span>
                      </span>
                      <span className={'font-mono text-cyan-400 font-bold ml-2 shrink-0'}>{progressPercent}%</span>
                    </div>

                    <div className={'w-full bg-neutral-800 rounded-full h-2.5 overflow-hidden border border-neutral-700/60'}>
                      <div
                        className={'bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 ease-out'}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {totalFilesToProcess > 0 && (
                      <p className={'text-center text-[11px] font-mono text-neutral-400'}>
                        Processed {processedFiles} of {totalFilesToProcess} files
                      </p>
                    )}
                  </div>
                )}

                {/* SUCCESS VIEW */}
                {installPhase === 'success' && (
                  <div className={'py-4 text-center space-y-2.5'}>
                    <div className={'w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-xl mx-auto border border-emerald-500/40'}>
                      <FontAwesomeIcon icon={faCheck} />
                    </div>
                    <h4 className={'text-sm font-bold text-neutral-100'}>Installation Complete!</h4>
                    <p className={'text-xs text-neutral-300 max-w-sm mx-auto'}>
                      {progressMessage}
                    </p>
                  </div>
                )}

                {/* ERROR VIEW */}
                {installPhase === 'error' && (
                  <div className={'py-3 space-y-3'}>
                    <div className={'p-3 bg-red-900/40 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-start gap-2.5'}>
                      <FontAwesomeIcon icon={faExclamationTriangle} className={'text-red-400 text-sm mt-0.5 shrink-0'} />
                      <div>
                        <span className={'font-bold'}>Installation Error</span>
                        <p className={'mt-0.5'}>{installError || 'An error occurred during installation.'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className={'px-4 py-3 bg-neutral-950/60 border-t border-neutral-800 flex items-center justify-end gap-2.5 shrink-0'}>
                {installPhase === 'idle' && (
                  <>
                    <button
                      onClick={() => setInstallModalOpen(false)}
                      className={'px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors'}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={startInstallation}
                      disabled={!selectedVersionId || loadingVersions}
                      className={'px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5'}
                    >
                      <FontAwesomeIcon icon={faDownload} />
                      Install Now
                    </button>
                  </>
                )}

                {installPhase === 'success' && (
                  <button
                    onClick={() => {
                      setInstallModalOpen(false);
                      setActiveTab('installed');
                    }}
                    className={'px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors'}
                  >
                    View Installed Modpack
                  </button>
                )}

                {installPhase === 'error' && (
                  <>
                    <button
                      onClick={() => setInstallModalOpen(false)}
                      className={'px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors'}
                    >
                      Close
                    </button>
                    <button
                      onClick={() => setInstallPhase('idle')}
                      className={'px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg transition-colors'}
                    >
                      Try Again
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
