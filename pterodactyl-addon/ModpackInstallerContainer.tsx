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

const MODRINTH_ICON = 'data:image/png;base64,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';

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

  // Provider State: 'modrinth' | 'curseforge'
  const [selectedProvider, setSelectedProvider] = useState<'modrinth' | 'curseforge'>('modrinth');

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
          provider: selectedProvider,
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
        setCatalogError(httpErrorToHuman(err) || `Failed to load modpacks from ${selectedProvider === 'curseforge' ? 'CurseForge' : 'Modrinth'}.`);
      })
      .finally(() => {
        setLoadingModpacks(false);
      });
  }, [uuid, selectedProvider, searchQuery, selectedLoader, selectedVersion, selectedCategory, selectedSort, page]);

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCatalog();
    }, 250);
    return () => clearTimeout(handler);
  }, [fetchCatalog]);

  // 4. Open Install Modal & Load Versions
  const openInstallModal = (modpack: ModpackHit) => {
    const projectId = modpack.project_id || modpack.id || modpack.slug;
    const provider = (modpack as any).provider || selectedProvider;
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
        provider,
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
    const provider = (activeModpack as any).provider || selectedProvider;
    const archiveUrl = chosenVersion?.files?.find((f) => f.primary)?.url || chosenVersion?.files?.[0]?.url;

    try {
      // Step 1: Prepare (allow up to 5 mins for downloading large .mrpack archives and extracting overrides)
      const prepRes = await http.post<PrepareResponse>(
        `/api/client/servers/${uuid}/modpacks/prepare`,
        {
          version_id: selectedVersionId,
          archive_url: archiveUrl,
          provider,
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

  const getModpackSourceUrl = (modpack: ModpackHit): { url: string; label: string } => {
    const provider = (modpack as any).provider || selectedProvider;
    const slug = modpack.slug || modpack.project_id || modpack.id || '';
    if (provider === 'curseforge') {
      return {
        url: `https://www.curseforge.com/minecraft/modpacks/${slug}`,
        label: 'CurseForge',
      };
    }
    return {
      url: `https://modrinth.com/modpack/${slug}`,
      label: 'Modrinth',
    };
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
              Browse, download, and install popular Minecraft modpacks from Modrinth and CurseForge with automatic loader setup and override syncing.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className={'flex items-center gap-2 bg-neutral-800/80 p-1.5 rounded-xl border border-neutral-700/60'}>
            <button
              onClick={() => setActiveTab('catalog')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'catalog'
                  ? 'bg-[#034f80] text-white shadow-lg shadow-[#034f80]/30'
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
                  ? 'bg-[#034f80] text-white shadow-lg shadow-[#034f80]/30'
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

            {/* Provider Source Selector Bar (Modrinth, CurseForge) */}
            <div className={'flex flex-wrap items-center gap-2.5 mb-6 p-2.5 bg-neutral-800/40 border border-neutral-700/50 rounded-xl'}>
              <span className={'text-xs font-semibold uppercase tracking-wider text-neutral-400 px-2'}>
                Source:
              </span>

              {/* Modrinth */}
              <button
                type={'button'}
                onClick={() => {
                  if (selectedProvider !== 'modrinth') {
                    setSelectedProvider('modrinth');
                    setPage(1);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                  selectedProvider === 'modrinth'
                    ? 'bg-neutral-900/90 text-emerald-400 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : 'bg-neutral-900/80 text-neutral-400 border-neutral-700/70 hover:text-neutral-200 hover:border-neutral-600'
                }`}
              >
                <img src={MODRINTH_ICON} alt="Modrinth" className="w-4 h-4 shrink-0 object-contain" />
                <span>Modrinth</span>
              </button>

              {/* CurseForge */}
              <button
                type={'button'}
                onClick={() => {
                  if (selectedProvider !== 'curseforge') {
                    setSelectedProvider('curseforge');
                    setPage(1);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                  selectedProvider === 'curseforge'
                    ? 'bg-neutral-900/90 text-[#F38148] border-[#D8602F] shadow-[0_0_12px_rgba(216,96,47,0.35)]'
                    : 'bg-neutral-900/80 text-neutral-400 border-neutral-700/70 hover:text-neutral-200 hover:border-neutral-600'
                }`}
              >
                <svg viewBox="0 0 320 320" className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path style={{ fill: 'rgb(216,96,47)' }} strokeLinecap="round" d="M244.0133 123.4342C244.0133 123.4342 309.3466 113.2632 319.6666 83.6053L219.5733 83.6053 219.5733 60.079-0.3333 60.079 26.76 91.1053 26.76 122.8816C26.76 122.8816 95.12 119.3816 121.56 139.1579 157.7467 172.2632 80.8534 217.0131 80.8534 217.0131L67.6534 260.0789C88.28 240.6973 127.5733 215.6447 199.64 216.8421 172.2133 225.3947 144.64 238.75 123.1733 260.0789L268.84 260.0789 255.12 217.0131C255.12 217.0131 149.5467 155.5921 244.0133 123.4342"/>
                </svg>
                <span>CurseForge</span>
              </button>
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
                <span className={'text-sm font-medium'}>
                  Loading modpacks from {selectedProvider === 'curseforge' ? 'CurseForge' : 'Modrinth'}...
                </span>
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
                  const source = getModpackSourceUrl(modpack);
                  return (
                    <div
                      key={cardId}
                      className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 hover:border-cyan-500/50 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/10'}
                    >
                      <div>
                        {/* Card Header: Icon, Titles & Source Redirect */}
                        <div className={'flex items-start justify-between gap-3 mb-3'}>
                          <div className={'flex items-start gap-3.5 min-w-0 flex-1'}>
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

                          {/* Source Website Redirect Button */}
                          <a
                            href={source.url}
                            target={'_blank'}
                            rel={'noopener noreferrer'}
                            className={'p-2 rounded-lg text-neutral-400 hover:text-cyan-300 bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-700/60 hover:border-cyan-500/50 transition-all duration-200 shrink-0 group'}
                            title={`View on ${source.label}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className={'w-3.5 h-3.5 group-hover:scale-110 transition-transform'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
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
                                className={'px-3 py-1.5 bg-[#034f80]/40 hover:bg-[#034f80]/70 border border-[#034f80]/60 text-blue-100 text-xs font-medium rounded-lg transition-colors'}
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
                            className={'w-full py-2 bg-[#034f80] hover:bg-[#023e65] text-white text-xs font-semibold rounded-lg shadow-lg shadow-[#034f80]/30 transition-all flex items-center justify-center gap-2'}
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
                  className={'mt-4 px-4 py-2 bg-[#034f80] hover:bg-[#023e65] text-white text-xs font-semibold rounded-lg shadow-md shadow-[#034f80]/30 transition-colors'}
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
                      className={'px-4 py-1.5 bg-[#034f80] hover:bg-[#023e65] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-md shadow-[#034f80]/30 transition-all flex items-center gap-1.5'}
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
