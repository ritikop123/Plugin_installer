import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBoxes,
  faDownload,
  faSpinner,
  faTimes,
  faSearch,
  faServer,
  faCheck,
  faExclamationTriangle,
  faSyncAlt,
} from '@fortawesome/free-solid-svg-icons';

interface SoftwareItem {
  id: string;
  name: string;
  category?: string;
  icon?: string;
  color?: string;
  homepage?: string;
  deprecated?: boolean;
  experimental?: boolean;
  description?: string;
  builds?: number;
  versions?: {
    minecraft?: number;
    project?: number;
  };
}

interface SoftwareVersionItem {
  version: string;
  type: string;
  supported: boolean;
  java?: number | null;
  builds: number;
  created?: string | null;
  latest?: {
    id?: number;
    name?: string;
    buildNumber?: number;
    jarUrl?: string | null;
    jarSize?: number | null;
    zipUrl?: string | null;
    zipSize?: number | null;
    installation?: any;
    experimental?: boolean;
  } | null;
}

interface SoftwareBuildItem {
  id: number;
  name?: string;
  buildNumber: number;
  jarUrl?: string | null;
  jarSize?: number | null;
  zipUrl?: string | null;
  zipSize?: number | null;
  installation?: any;
  experimental?: boolean;
  created?: string | null;
}

const formatBytes = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export default function SoftwareInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  // Screen 1: Software List State
  const [softwareList, setSoftwareList] = useState<SoftwareItem[]>([]);
  const [loadingSoftware, setLoadingSoftware] = useState<boolean>(true);
  const [softwareError, setSoftwareError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Screen 2: Version List State
  const [selectedSoftware, setSelectedSoftware] = useState<SoftwareItem | null>(null);
  const [versionList, setVersionList] = useState<SoftwareVersionItem[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [showSnapshots, setShowSnapshots] = useState<boolean>(false);
  const [versionSearch, setVersionSearch] = useState<string>('');

  // Screen 3: Modal & Build Install State
  const [selectedVersion, setSelectedVersion] = useState<SoftwareVersionItem | null>(null);
  const [builds, setBuilds] = useState<SoftwareBuildItem[]>([]);
  const [loadingBuilds, setLoadingBuilds] = useState<boolean>(false);
  const [selectedBuild, setSelectedBuild] = useState<SoftwareBuildItem | null>(null);
  const [wipeFiles, setWipeFiles] = useState<boolean>(false);
  const [installing, setInstalling] = useState<boolean>(false);
  const [installNotice, setInstallNotice] = useState<{ success: boolean; message: string } | null>(null);

  // 1. Fetch Software Catalog from Backend
  const fetchSoftwareCatalog = useCallback(() => {
    setLoadingSoftware(true);
    setSoftwareError(null);

    http.get<{ success: boolean; software: SoftwareItem[] }>(`/api/client/servers/${uuid}/software`)
      .then((res) => {
        if (res.data && Array.isArray(res.data.software)) {
          setSoftwareList(res.data.software);
        } else {
          setSoftwareList([]);
        }
      })
      .catch((err: unknown) => {
        setSoftwareError(httpErrorToHuman(err) || 'Failed to load software catalog.');
      })
      .finally(() => {
        setLoadingSoftware(false);
      });
  }, [uuid]);

  useEffect(() => {
    fetchSoftwareCatalog();
  }, [fetchSoftwareCatalog]);

  // 2. Fetch Versions for Selected Software
  const selectSoftware = (software: SoftwareItem) => {
    setSelectedSoftware(software);
    setVersionList([]);
    setLoadingVersions(true);
    setVersionError(null);
    setVersionSearch('');

    http.get<{ success: boolean; versions: SoftwareVersionItem[] }>(`/api/client/servers/${uuid}/software/versions`, {
      params: { type: software.id },
    })
      .then((res) => {
        if (res.data && Array.isArray(res.data.versions)) {
          setVersionList(res.data.versions);
        } else {
          setVersionList([]);
        }
      })
      .catch((err: unknown) => {
        setVersionError(httpErrorToHuman(err) || `Failed to load versions for ${software.name}.`);
      })
      .finally(() => {
        setLoadingVersions(false);
      });
  };

  // 3. Open Modal for Selected Version & Fetch Specific Builds
  const openVersionModal = (ver: SoftwareVersionItem) => {
    setSelectedVersion(ver);
    setBuilds([]);
    setSelectedBuild(null);
    setLoadingBuilds(true);
    setWipeFiles(false);
    setInstallNotice(null);

    if (!selectedSoftware) return;

    http.get<{ success: boolean; builds: SoftwareBuildItem[] }>(`/api/client/servers/${uuid}/software/builds`, {
      params: { type: selectedSoftware.id, version: ver.version },
    })
      .then((res) => {
        if (res.data && Array.isArray(res.data.builds) && res.data.builds.length > 0) {
          setBuilds(res.data.builds);
          setSelectedBuild(res.data.builds[0]);
        } else if (ver.latest?.jarUrl || ver.latest?.zipUrl || ver.latest?.installation) {
          // Fallback to latest build summary if list is empty
          const fallback: SoftwareBuildItem = {
            id: ver.latest.id || 1,
            name: ver.latest.name || `#${ver.latest.buildNumber || 1}`,
            buildNumber: ver.latest.buildNumber || 1,
            jarUrl: ver.latest.jarUrl,
            jarSize: ver.latest.jarSize,
            zipUrl: ver.latest.zipUrl,
            zipSize: ver.latest.zipSize,
            installation: ver.latest.installation,
            experimental: ver.latest.experimental,
          };
          setBuilds([fallback]);
          setSelectedBuild(fallback);
        }
      })
      .catch(() => {
        if (ver.latest?.jarUrl || ver.latest?.zipUrl || ver.latest?.installation) {
          const fallback: SoftwareBuildItem = {
            id: ver.latest.id || 1,
            name: ver.latest.name || `#${ver.latest.buildNumber || 1}`,
            buildNumber: ver.latest.buildNumber || 1,
            jarUrl: ver.latest.jarUrl,
            jarSize: ver.latest.jarSize,
            zipUrl: ver.latest.zipUrl,
            zipSize: ver.latest.zipSize,
            installation: ver.latest.installation,
            experimental: ver.latest.experimental,
          };
          setBuilds([fallback]);
          setSelectedBuild(fallback);
        }
      })
      .finally(() => {
        setLoadingBuilds(false);
      });
  };

  // 4. Handle Server Software Installation
  const handleInstall = async () => {
    const hasDownload = Boolean(
      selectedBuild?.jarUrl ||
      selectedBuild?.zipUrl ||
      (selectedBuild?.installation && selectedBuild.installation.length > 0)
    );
    if (!hasDownload || !selectedSoftware) return;

    if (wipeFiles) {
      const confirmed = window.confirm(
        'WARNING: You have enabled "Wipe Server Files". All current files on this server will be deleted! Are you sure you want to continue?'
      );
      if (!confirmed) return;
    }

    setInstalling(true);
    setInstallNotice(null);

    try {
      const primaryUrl = selectedBuild.zipUrl || selectedBuild.jarUrl || '';
      const response = await http.post<{ success: boolean; message: string }>(
        `/api/client/servers/${uuid}/software/install`,
        {
          url: primaryUrl,
          jarUrl: selectedBuild.jarUrl,
          zipUrl: selectedBuild.zipUrl,
          software: selectedSoftware.id,
          version: selectedVersion?.version,
          installation: selectedBuild.installation,
          wipe: wipeFiles,
          filename: 'server.jar',
        }
      );

      setInstallNotice({
        success: true,
        message: response.data.message || `Successfully installed ${selectedSoftware.name} on your server!`,
      });
    } catch (err: unknown) {
      setInstallNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Installation failed. Please check your server permissions.',
      });
    } finally {
      setInstalling(false);
    }
  };

  // Filter Software List
  const filteredSoftware = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return softwareList;
    return softwareList.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q))
    );
  }, [softwareList, searchQuery]);

  // Filter Version List
  const filteredVersions = useMemo(() => {
    return versionList.filter((v) => {
      if (!showSnapshots && v.type?.toUpperCase() !== 'RELEASE') return false;
      if (versionSearch.trim()) {
        return v.version.toLowerCase().includes(versionSearch.toLowerCase().trim());
      }
      return true;
    });
  }, [versionList, showSnapshots, versionSearch]);

  return (
    <ServerContentBlock title={'Software Installer'}>
      <div className="max-w-7xl mx-auto space-y-5 my-2">

        {/* SCREEN 1: Software Catalog Grid (Matching Screenshot 1) */}
        {!selectedSoftware && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Software Installer</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a server software to install or change versions on your server.
                </p>
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[220px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-xs" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search software..."
                  className="w-full pl-8 pr-3 py-2 bg-[#111728]/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {loadingSoftware && (
              <div className="py-24 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-400" />
                <span>Loading available server software...</span>
              </div>
            )}

            {softwareError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <span>{softwareError}</span>
              </div>
            )}

            {/* Exact 3-column cards matching Screenshot 1 */}
            {!loadingSoftware && !softwareError && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredSoftware.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => selectSoftware(item)}
                    className="bg-[#111728]/70 hover:bg-[#151d32]/90 backdrop-blur-md border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3.5 flex items-center gap-3.5 cursor-pointer transition-all shadow-md hover:shadow-blue-500/10 hover:translate-y-[-1px] group"
                  >
                    {/* Left Icon Container */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden shrink-0 bg-slate-900/80 border border-slate-800 group-hover:border-slate-700 transition-colors">
                      {item.icon ? (
                        <img src={item.icon} alt={item.name} className="w-9 h-9 object-contain" />
                      ) : (
                        <FontAwesomeIcon icon={faServer} className="text-lg text-slate-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">
                          {item.name}
                        </h3>
                        {item.deprecated && <span title="Deprecated">💀</span>}
                        {item.experimental && <span title="Experimental">⚠️</span>}
                      </div>

                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {item.versions?.minecraft || item.versions?.project || 0} Minecraft versions
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {item.builds ? `${item.builds} Builds` : 'Multiple Builds'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCREEN 2: Version Selector (Matching Screenshot 2) */}
        {selectedSoftware && (
          <div className="space-y-4">
            {/* Top Bar with Go Back & Snapshot Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedSoftware(null)}
                  className="px-3 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 text-xs font-semibold flex items-center gap-2 transition-all"
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
                  <span>Go Back</span>
                </button>

                <button
                  onClick={() => setShowSnapshots(!showSnapshots)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                    showSnapshots
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500/50'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                  }`}
                >
                  <FontAwesomeIcon icon={faBoxes} className="text-xs" />
                  <span>Show Snapshot Versions</span>
                </button>
              </div>

              {/* Version Search */}
              <div className="relative min-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-xs" />
                </span>
                <input
                  type="text"
                  value={versionSearch}
                  onChange={(e) => setVersionSearch(e.target.value)}
                  placeholder={`Search ${selectedSoftware.name} versions...`}
                  className="w-full pl-8 pr-3 py-2 bg-[#111728]/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {loadingVersions && (
              <div className="py-24 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-400" />
                <span>Loading available versions for {selectedSoftware.name}...</span>
              </div>
            )}

            {versionError && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                <span>{versionError}</span>
              </div>
            )}

            {/* Exact 3-column cards matching Screenshot 2 */}
            {!loadingVersions && !versionError && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredVersions.map((ver) => (
                  <div
                    key={ver.version}
                    onClick={() => openVersionModal(ver)}
                    className="bg-[#111728]/70 hover:bg-[#151d32]/90 backdrop-blur-md border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-3 flex items-center justify-between gap-3 cursor-pointer transition-all shadow-md hover:shadow-blue-500/10 group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Icon */}
                      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-slate-900/80 border border-slate-800">
                        {selectedSoftware.icon ? (
                          <img src={selectedSoftware.icon} alt="" className="w-6 h-6 object-contain" />
                        ) : (
                          <FontAwesomeIcon icon={faServer} className="text-slate-400 text-xs" />
                        )}
                      </div>

                      {/* Version & Tag */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors truncate">
                          {ver.version}
                        </p>
                        <p
                          className={`text-[9px] font-bold tracking-wider uppercase mt-0.5 ${
                            ver.type?.toUpperCase() === 'RELEASE' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {ver.type || 'RELEASE'}
                        </p>
                      </div>
                    </div>

                    {/* Builds Count on Right */}
                    <span className="text-xs text-slate-400 font-medium shrink-0">
                      {ver.builds} Builds
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCREEN 3: Install Dialog Modal (Matching Screenshot 3) */}
        {selectedVersion && selectedSoftware && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0e1424] border border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-slate-900 border border-slate-800">
                    {selectedSoftware.icon ? (
                      <img src={selectedSoftware.icon} alt="" className="w-5 h-5 object-contain" />
                    ) : (
                      <FontAwesomeIcon icon={faServer} className="text-xs text-slate-400" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Install {selectedSoftware.name} {selectedVersion.version}
                    </h3>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedVersion(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg text-xs"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-sm" />
                </button>
              </div>

              {/* Build Selector Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Select Build
                </label>
                {loadingBuilds ? (
                  <div className="px-3 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                    <FontAwesomeIcon icon={faSpinner} spin className="text-xs text-blue-400" />
                    <span>Loading builds...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={selectedBuild?.id ?? ''}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        const found = builds.find((b) => b.id === id);
                        if (found) setSelectedBuild(found);
                      }}
                      className="w-full px-3 py-2.5 bg-slate-950/70 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded-xl text-xs text-white focus:outline-none transition-colors"
                    >
                      {builds.map((b) => {
                        const label = b.name
                          ? (b.name.startsWith('#') ? `Build ${b.name}` : `Version ${b.name}`)
                          : `Build #${b.buildNumber}`;
                        return (
                          <option key={b.id} value={b.id}>
                            {label} {b.experimental ? '[beta]' : '[release]'}
                          </option>
                        );
                      })}
                    </select>

                    {selectedBuild && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span>
                          {(selectedBuild.jarSize || selectedBuild.zipSize) ? (
                            <>Package size: <strong className="text-slate-200">{formatBytes(selectedBuild.jarSize || selectedBuild.zipSize)}</strong></>
                          ) : (
                            <span className="text-slate-500">Ready to install</span>
                          )}
                        </span>
                        {selectedBuild.name && (
                          <span className="truncate max-w-[200px]">
                            Build: <strong className="text-slate-200">{selectedBuild.name}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Wipe Server Files Toggle Card (Matching Screenshot 3) */}
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-start gap-3.5">
                {/* Switch Button */}
                <button
                  type="button"
                  onClick={() => setWipeFiles(!wipeFiles)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-0.5 ${
                    wipeFiles ? 'bg-rose-600' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      wipeFiles ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                {/* Text Content */}
                <div className="flex-1">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-200">
                    WIPE SERVER FILES
                  </span>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    This will delete all files on your server before installing the new version. This cannot be undone.
                  </p>
                </div>
              </div>

              {/* Status Alert */}
              {installNotice && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    installNotice.success
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-200 border border-rose-500/30'
                  }`}
                >
                  <FontAwesomeIcon
                    icon={installNotice.success ? faCheck : faExclamationTriangle}
                    className="text-xs"
                  />
                  <span className="truncate">{installNotice.message}</span>
                </div>
              )}

              {/* Install Action Button (Matching Screenshot 3) */}
              <button
                onClick={handleInstall}
                disabled={
                  installing ||
                  (!selectedBuild?.jarUrl && !selectedBuild?.zipUrl && (!selectedBuild?.installation || selectedBuild.installation.length === 0))
                }
                className="w-full py-2.5 bg-blue-600/90 hover:bg-blue-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-xs transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {installing ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} spin className="text-sm" />
                    <span>Installing {selectedSoftware.name}...</span>
                  </>
                ) : (
                  <>
                    <FontAwesomeIcon icon={faDownload} className="text-sm" />
                    <span>Install {selectedSoftware.name}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </ServerContentBlock>
  );
}
