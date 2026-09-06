import { useState, useEffect } from 'react';
import {
  X,
  Download,
  Calendar,
  HardDrive,
  ExternalLink,
  AlertCircle,
  Loader2,
  Box,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import {
  ModrinthSearchHit,
  ModrinthVersion,
  VersionTypeFilter,
} from '../types/modrinth';
import { getProjectVersions } from '../services/modrinthApi';
import { installPluginToContainer } from '../services/containerInstaller';

interface PluginModalProps {
  plugin: ModrinthSearchHit | null;
  onClose: () => void;
}

export const PluginModal: React.FC<PluginModalProps> = ({ plugin, onClose }) => {
  const [versions, setVersions] = useState<ModrinthVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters inside the popup modal
  const [filterSoftware, setFilterSoftware] = useState<string>('all');
  const [filterGameVersion, setFilterGameVersion] = useState<string>('all');
  const [filterType, setFilterType] = useState<VersionTypeFilter>('all');

  // Track installed state for user feedback
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installedVersions, setInstalledVersions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!plugin) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    // Reset filters
    setFilterSoftware('all');
    setFilterGameVersion('all');
    setFilterType('all');

    const fetchData = async () => {
      try {
        const projVersions = await getProjectVersions(plugin.project_id || plugin.slug);

        if (isMounted) {
          setVersions(projVersions);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.response?.data?.description || err?.message || 'Failed to load plugin versions');
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [plugin]);

  if (!plugin) return null;

  // Extract available loaders and game versions across fetched versions for dynamic dropdowns
  const availableLoaders = Array.from(
    new Set(versions.flatMap((v) => v.loaders || []))
  ).sort();

  const availableGameVersions = Array.from(
    new Set(versions.flatMap((v) => v.game_versions || []))
  );

  // Filter versions by software, game version, and release type
  const filteredVersions = versions.filter((ver) => {
    // Release type filter (all, release, beta, alpha)
    if (filterType !== 'all' && ver.version_type !== filterType) {
      return false;
    }

    // Software loader filter
    if (filterSoftware !== 'all' && !ver.loaders?.includes(filterSoftware)) {
      return false;
    }

    // Minecraft game version filter
    if (filterGameVersion !== 'all' && !ver.game_versions?.includes(filterGameVersion)) {
      return false;
    }

    return true;
  });

  const handleInstall = async (version: ModrinthVersion) => {
    const primaryFile = version.files?.find((f) => f.primary) || version.files?.[0];
    if (!primaryFile) return;

    setInstallingVersionId(version.id);

    try {
      // Auto-creates /plugins container folder if missing and installs the jar
      await installPluginToContainer({
        file: primaryFile,
        pluginName: plugin.title,
        serverDirectory: '/plugins',
      });

      setInstallingVersionId(null);
      setInstalledVersions((prev) => ({ ...prev, [version.id]: true }));
    } catch (err) {
      console.error('Failed to install plugin to container:', err);
      setInstallingVersionId(null);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] bg-[#101522] border border-cyan-500/30 rounded-3xl shadow-arix-modal overflow-hidden">
        {/* Modal Header */}
        <div className="relative px-6 py-5 bg-[#151b2d]/90 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-[#0a0d14] border border-cyan-500/30 overflow-hidden flex items-center justify-center shadow-lg">
              {plugin.icon_url ? (
                <img src={plugin.icon_url} alt={plugin.title} className="w-full h-full object-cover" />
              ) : (
                <Box className="w-8 h-8 text-cyan-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-extrabold text-white tracking-wide">{plugin.title}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                  {plugin.project_type || 'Plugin'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Created by <span className="text-slate-200 font-semibold">{plugin.author}</span>
              </p>
              <p className="text-xs text-slate-300 mt-2 line-clamp-2 max-w-2xl">{plugin.description}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters Bar Inside the Popup (Software, Version, Type) */}
        <div className="px-6 py-3.5 bg-[#0d111a] border-b border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          {/* Software Selector Inside Popup */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Software / Loader
            </label>
            <select
              value={filterSoftware}
              onChange={(e) => setFilterSoftware(e.target.value)}
              aria-label="Filter versions by software loader"
              className="w-full px-3 py-2 bg-[#161c2d] border border-slate-700/80 hover:border-cyan-500/50 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All Compatible Platforms</option>
              {availableLoaders.map((loader) => (
                <option key={loader} value={loader}>
                  {loader.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Minecraft Version Selector Inside Popup */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Minecraft Version
            </label>
            <select
              value={filterGameVersion}
              onChange={(e) => setFilterGameVersion(e.target.value)}
              aria-label="Filter versions by Minecraft game version"
              className="w-full px-3 py-2 bg-[#161c2d] border border-slate-700/80 hover:border-cyan-500/50 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All Minecraft Versions</option>
              {availableGameVersions.map((ver) => (
                <option key={ver} value={ver}>
                  {ver}
                </option>
              ))}
            </select>
          </div>

          {/* Type Option Filter (All, Release, Beta, Alpha) */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Version Type
            </label>
            <div className="grid grid-cols-4 gap-1 p-1 bg-[#161c2d] rounded-xl border border-slate-700/80 text-center">
              {(['all', 'release', 'beta', 'alpha'] as VersionTypeFilter[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all ${
                    filterType === type
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

        {/* Versions List Container */}
        <div className="flex-1 p-6 overflow-y-auto space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm font-medium">Fetching versions from Modrinth...</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && filteredVersions.length === 0 && (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-slate-600" />
              <p className="text-sm font-medium text-slate-300">No versions match your active filters.</p>
              <p className="text-xs text-slate-500">Try changing software, version, or type filter above.</p>
            </div>
          )}

          {!loading &&
            !error &&
            filteredVersions.map((ver) => {
              const primaryFile = ver.files?.find((f) => f.primary) || ver.files?.[0];
              const isInstalled = installedVersions[ver.id];
              const isInstalling = installingVersionId === ver.id;

              return (
                <div
                  key={ver.id}
                  className="p-4 rounded-2xl bg-[#131929] hover:bg-[#161d31] border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                >
                  {/* Left: Version Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-sm font-bold text-white tracking-wide">
                        {ver.name || ver.version_number}
                      </span>
                      <span className="font-mono text-xs text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded-md border border-cyan-500/30">
                        {ver.version_number}
                      </span>

                      {/* Version Type Badge */}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          ver.version_type === 'release'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : ver.version_type === 'beta'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {ver.version_type}
                      </span>
                    </div>

                    {/* Metadata pills: Loaders, Game versions, Date, Size */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        {formatDate(ver.date_published)}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        {formatFileSize(primaryFile?.size)}
                      </span>
                      {primaryFile?.filename && (
                        <span className="font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">
                          {primaryFile.filename}
                        </span>
                      )}
                    </div>

                    {/* Supported Loaders & Minecraft versions */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {ver.loaders?.map((loader) => (
                        <span
                          key={loader}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800/80 text-cyan-300/80 border border-slate-700/60"
                        >
                          {loader}
                        </span>
                      ))}
                      <span className="text-[10px] text-slate-500">|</span>
                      <span className="text-[10px] text-slate-400">
                        MC: {ver.game_versions?.slice(0, 4).join(', ')}
                        {ver.game_versions?.length > 4 && ` +${ver.game_versions.length - 4}`}
                      </span>
                    </div>
                  </div>

                  {/* Right: Install & Download Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {primaryFile && (
                      <a
                        href={primaryFile.url}
                        download={primaryFile.filename}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                        title="Direct Download File (.jar)"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      onClick={() => handleInstall(ver)}
                      disabled={isInstalling || !primaryFile}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                        isInstalled
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/20'
                      }`}
                    >
                      {isInstalling ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Installing...</span>
                        </>
                      ) : isInstalled ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Installed</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Install Plugin</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-[#151b2d] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>
              Showing {filteredVersions.length} of {versions.length} versions
            </span>
          </div>

          <a
            href={`https://modrinth.com/plugin/${plugin.slug || plugin.project_id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 hover:underline font-medium"
          >
            <span>View on Modrinth</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
