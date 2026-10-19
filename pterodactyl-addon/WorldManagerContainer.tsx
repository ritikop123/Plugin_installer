import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGlobeAmericas,
  faDownload,
  faUpload,
  faSlidersH,
  faFolderOpen,
  faFolder,
  faSyncAlt,
  faTrashAlt,
  faCheck,
  faTimes,
  faQuestionCircle,
  faCopy,
  faSpinner,
  faExclamationTriangle,
  faCheckCircle,
  faArrowLeft,
  faPlus,
  faMinus,
  faCompass,
  faMountain,
  faFileArchive,
  faDice,
  faSearch,
} from '@fortawesome/free-solid-svg-icons';

interface WorldItem {
  name: string;
  is_active: boolean;
  is_dimension?: boolean;
  dimension_type?: 'overworld' | 'nether' | 'the_end';
  size: number;
  modified_at?: string;
  has_level_dat: boolean;
  has_overworld: boolean;
  has_nether: boolean;
  nether_type: 'folder' | 'subfolder' | 'none';
  has_end: boolean;
  end_type: 'folder' | 'subfolder' | 'none';
  optimized: boolean;
  force_upgrade: boolean;
}

interface WorldDataResponse {
  active_world: string;
  seed: string;
  difficulty: string;
  gamemode: string;
  hardcore: boolean;
  worlds: WorldItem[];
}

interface WorldOptionsResponse {
  world: string;
  seed: string;
  hardcore: boolean;
  difficulty: string;
  enabled_features: string[];
  enabled_datapacks: string[];
  disabled_datapacks: string[];
  gamerules: Record<string, boolean | number>;
}

// Custom Aternos-style binary toggle switch matching user screenshots
function AternosToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`inline-flex items-center rounded p-0.5 border border-gray-600/60 bg-[#1e252b] transition-all cursor-pointer ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-400'
      }`}
      style={{ width: '56px', height: '28px' }}
      title={value ? 'Enabled (Click to disable)' : 'Disabled (Click to enable)'}
    >
      <div className="flex w-full h-full items-center justify-between">
        {/* Left side: Red X when false */}
        <div
          className={`w-6 h-full flex items-center justify-center rounded-sm transition-all ${
            !value
              ? 'bg-[#e11d48] text-white shadow-sm'
              : 'bg-transparent text-transparent'
          }`}
        >
          {!value && <FontAwesomeIcon icon={faTimes} className="text-xs font-bold" />}
        </div>

        {/* Right side: Green checkmark when true */}
        <div
          className={`w-6 h-full flex items-center justify-center rounded-sm transition-all ${
            value
              ? 'bg-[#10b981] text-white shadow-sm'
              : 'bg-transparent text-transparent'
          }`}
        >
          {value && <FontAwesomeIcon icon={faCheck} className="text-xs font-bold" />}
        </div>
      </div>
    </button>
  );
}

// Numeric Stepper matching user screenshots
function NumericStepper({
  value,
  onChange,
  min = 0,
  max = 1000000,
  disabled = false,
}: {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [localVal, setLocalVal] = useState<number>(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleCommit = (newVal: number) => {
    const clamped = Math.max(min, Math.min(max, newVal));
    setLocalVal(clamped);
    onChange(clamped);
  };

  return (
    <div className="inline-flex items-stretch rounded bg-[#1e252b] border border-gray-600/70 overflow-hidden h-8">
      {/* Icon badge */}
      <div className="px-2.5 flex items-center justify-center bg-gray-800 text-gray-400 text-xs border-r border-gray-700 font-mono">
        #
      </div>

      {/* Input / display */}
      <input
        type="number"
        disabled={disabled}
        value={localVal}
        onChange={(e) => setLocalVal(parseInt(e.target.value, 10) || 0)}
        onBlur={() => handleCommit(localVal)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCommit(localVal);
        }}
        className="w-16 bg-transparent text-center font-bold text-white text-sm focus:outline-none focus:bg-gray-800/60"
      />

      {/* Stepper buttons */}
      <div className="flex flex-col border-l border-gray-700 w-6">
        <button
          type="button"
          disabled={disabled || localVal >= max}
          onClick={() => handleCommit(localVal + 1)}
          className="flex-1 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-[9px] border-b border-gray-700 disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
        <button
          type="button"
          disabled={disabled || localVal <= min}
          onClick={() => handleCommit(localVal - 1)}
          className="flex-1 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-[9px] disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faMinus} />
        </button>
      </div>
    </div>
  );
}

export default function WorldManagerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  // Core Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<WorldDataResponse | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // View state: null = World List, string = Options view for specific world
  const [viewingOptionsForWorld, setViewingOptionsForWorld] = useState<string | null>(null);
  const [optionsData, setOptionsData] = useState<WorldOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState<boolean>(false);
  const [gameruleSearch, setGameruleSearch] = useState<string>('');
  const [copiedSeed, setCopiedSeed] = useState<boolean>(false);

  // Upload dropdown menu state: string = world name that has open menu
  const [uploadMenuOpenFor, setUploadMenuOpenFor] = useState<string | null>(null);

  // Modals
  const [generateModalOpen, setGenerateModalOpen] = useState<boolean>(false);
  const [targetWorldForGenerate, setTargetWorldForGenerate] = useState<string>('world');
  const [generateSeed, setGenerateSeed] = useState<string>('');
  const [generateWorldType, setGenerateWorldType] = useState<string>('default');
  const [generateBackup, setGenerateBackup] = useState<boolean>(true);

  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [targetWorldForDelete, setTargetWorldForDelete] = useState<string | null>(null);

  // Hidden file inputs
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetWorldRef = useRef<string>('world');

  // Auto-dismiss toast
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Fetch Worlds list
  const fetchWorlds = useCallback(() => {
    setLoading(true);
    http
      .get<WorldDataResponse>(`/api/client/servers/${uuid}/worlds`)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to load world data.',
        });
      })
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => {
    fetchWorlds();
  }, [fetchWorlds]);

  // Fetch Options for specific world
  const fetchWorldOptions = useCallback(
    (worldName: string) => {
      setOptionsLoading(true);
      http
        .get<WorldOptionsResponse>(`/api/client/servers/${uuid}/worlds/options?world=${encodeURIComponent(worldName)}`)
        .then((res) => {
          setOptionsData(res.data);
        })
        .catch((err) => {
          setToastMessage({
            type: 'error',
            text: httpErrorToHuman(err) || 'Failed to load world options.',
          });
        })
        .finally(() => setOptionsLoading(false));
    },
    [uuid]
  );

  const openOptionsView = (worldName: string) => {
    setViewingOptionsForWorld(worldName);
    fetchWorldOptions(worldName);
  };

  const closeOptionsView = () => {
    setViewingOptionsForWorld(null);
    setOptionsData(null);
    fetchWorlds();
  };

  // Optimize Toggle
  const handleToggleOptimize = (worldName: string, nextValue: boolean) => {
    setActionLoading(`optimize-${worldName}`);
    http
      .post(`/api/client/servers/${uuid}/worlds/optimize`, { world: worldName, enabled: nextValue })
      .then((res: any) => {
        setToastMessage({
          type: 'success',
          text: res.data?.message || `Optimization ${nextValue ? 'enabled' : 'disabled'} for ${worldName}.`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to toggle optimization.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  // Force Upgrade Toggle
  const handleToggleForceUpgrade = (worldName: string, nextValue: boolean) => {
    setActionLoading(`force-${worldName}`);
    http
      .post(`/api/client/servers/${uuid}/worlds/force-upgrade`, { world: worldName, enabled: nextValue })
      .then((res: any) => {
        setToastMessage({
          type: 'success',
          text: res.data?.message || `Force upgrade ${nextValue ? 'enabled' : 'disabled'} for ${worldName}.`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to toggle force upgrade.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  // Download World
  const handleDownloadWorld = (worldName: string) => {
    setActionLoading(`download-${worldName}`);
    setToastMessage({
      type: 'success',
      text: `Compressing world '${worldName}' into .zip archive. Please wait...`,
    });

    http
      .post(`/api/client/servers/${uuid}/worlds/download`, { world: worldName })
      .then((res: any) => {
        const archiveName = res.data?.archive;
        if (!archiveName) {
          throw new Error('Compression finished but archive filename was not returned.');
        }

        // Fetch signed download JWT from Pterodactyl's native file download endpoint
        return http.get(`/api/client/servers/${uuid}/files/download?file=/${encodeURIComponent(archiveName)}`);
      })
      .then((res: any) => {
        const downloadUrl = res.data?.attributes?.url;
        if (downloadUrl) {
          setToastMessage({
            type: 'success',
            text: `World '${worldName}' compressed successfully! Download starting...`,
          });
          window.location.href = downloadUrl;
        } else {
          setToastMessage({
            type: 'success',
            text: `World '${worldName}' compressed as archive in file manager.`,
          });
        }
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to download world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  // Upload Zip handler
  const handleZipFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetWorld = uploadTargetWorldRef.current;
    setActionLoading(`upload-${targetWorld}`);
    setToastMessage({
      type: 'success',
      text: `Uploading '${file.name}' to server...`,
    });

    // 1. Get signed upload URL from Pterodactyl
    http
      .get(`/api/client/servers/${uuid}/files/upload`)
      .then((res: any) => {
        const uploadUrl = res.data?.attributes?.url;
        if (!uploadUrl) {
          throw new Error('Could not obtain signed upload URL.');
        }

        const formData = new FormData();
        formData.append('files', file);

        return fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });
      })
      .then((res) => {
        if (!res.ok) {
          throw new Error('Upload to daemon failed.');
        }
        setToastMessage({
          type: 'success',
          text: `File uploaded. Unpacking world archive into server...`,
        });

        // 2. Call backend unpack endpoint
        return http.post(`/api/client/servers/${uuid}/worlds/upload`, {
          file_name: file.name,
          world: targetWorld,
        });
      })
      .then((res: any) => {
        setToastMessage({
          type: 'success',
          text: res.data?.message || `World '${file.name}' successfully installed!`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to upload and extract world.',
        });
      })
      .finally(() => {
        setActionLoading(null);
        if (zipInputRef.current) zipInputRef.current.value = '';
      });
  };

  // Upload Folder handler
  const handleFolderFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetWorld = uploadTargetWorldRef.current;
    setActionLoading(`upload-${targetWorld}`);
    setToastMessage({
      type: 'success',
      text: `Uploading ${files.length} world folder files to server...`,
    });

    // Obtain signed upload URL from Pterodactyl
    http
      .get(`/api/client/servers/${uuid}/files/upload?directory=/${encodeURIComponent(targetWorld)}`)
      .then((res: any) => {
        const uploadUrl = res.data?.attributes?.url;
        if (!uploadUrl) {
          throw new Error('Could not obtain signed upload URL.');
        }

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
          formData.append('files', files[i]);
        }

        return fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });
      })
      .then((res) => {
        if (!res.ok) throw new Error('Upload to daemon failed.');
        setToastMessage({
          type: 'success',
          text: `World folder files successfully uploaded to '${targetWorld}'. Restart server to load.`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to upload folder files.',
        });
      })
      .finally(() => {
        setActionLoading(null);
        if (folderInputRef.current) folderInputRef.current.value = '';
      });
  };

  // Generate / Regenerate World
  const handleGenerateConfirm = () => {
    setActionLoading('generating');
    http
      .post(`/api/client/servers/${uuid}/worlds/create`, {
        name: targetWorldForGenerate,
        seed: generateSeed,
        world_type: generateWorldType,
        create_backup: generateBackup,
      })
      .then((res: any) => {
        setToastMessage({
          type: 'success',
          text: res.data?.message || `World '${targetWorldForGenerate}' generated successfully.`,
        });
        setGenerateModalOpen(false);
        fetchWorlds();
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to generate world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  // Delete World
  const handleDeleteConfirm = () => {
    if (!targetWorldForDelete) return;
    setActionLoading(`delete-${targetWorldForDelete}`);
    http
      .post(`/api/client/servers/${uuid}/worlds/delete`, { world: targetWorldForDelete })
      .then((res: any) => {
        setToastMessage({
          type: 'success',
          text: res.data?.message || `World '${targetWorldForDelete}' deleted successfully.`,
        });
        setDeleteModalOpen(false);
        setTargetWorldForDelete(null);
        fetchWorlds();
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to delete world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  // Update Gamerule
  const handleUpdateGamerule = (rule: string, value: boolean | number) => {
    if (!optionsData) return;

    // Optimistically update local state
    setOptionsData((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        gamerules: {
          ...prev.gamerules,
          [rule]: value,
        },
      };
    });

    http
      .post(`/api/client/servers/${uuid}/worlds/gamerule`, {
        world: optionsData.world,
        rule,
        value,
      })
      .then(() => {
        // Updated quietly
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || `Failed to update gamerule '${rule}'.`,
        });
      });
  };

  // Update Hardcore
  const handleUpdateHardcore = (hardcore: boolean) => {
    if (!optionsData) return;
    setOptionsData((prev) => (prev ? { ...prev, hardcore } : null));

    http
      .post(`/api/client/servers/${uuid}/worlds/options`, {
        world: optionsData.world,
        hardcore,
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to update hardcore setting.',
        });
      });
  };

  // Update Difficulty
  const handleUpdateDifficulty = (difficulty: string) => {
    if (!optionsData) return;
    setOptionsData((prev) => (prev ? { ...prev, difficulty } : null));

    http
      .post(`/api/client/servers/${uuid}/worlds/options`, {
        world: optionsData.world,
        difficulty,
      })
      .catch((err) => {
        setToastMessage({
          type: 'error',
          text: httpErrorToHuman(err) || 'Failed to update difficulty.',
        });
      });
  };

  // Copy Seed
  const handleCopySeed = (seedText: string) => {
    if (!seedText) return;
    navigator.clipboard.writeText(seedText);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  // Filtered Gamerules
  const filteredGamerules = useMemo(() => {
    if (!optionsData?.gamerules) return [];
    const entries = Object.entries(optionsData.gamerules);
    if (!gameruleSearch.trim()) return entries;
    const q = gameruleSearch.toLowerCase().trim();
    return entries.filter(([rule]) => rule.toLowerCase().includes(q));
  }, [optionsData?.gamerules, gameruleSearch]);

  return (
    <ServerContentBlock
      title="Worlds"
      description="Manage Minecraft world dimensions, smart performance optimizations, gamerules, and backups."
    >
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl border text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
              : 'bg-rose-950/95 border-rose-500/50 text-rose-100'
          }`}
        >
          <FontAwesomeIcon
            icon={toastMessage.type === 'success' ? faCheckCircle : faExclamationTriangle}
            className={toastMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}
          />
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-gray-400 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}

      {/* Hidden inputs for Upload */}
      <input
        type="file"
        ref={zipInputRef}
        accept=".zip,.tar.gz,.tar"
        style={{ display: 'none' }}
        onChange={handleZipFileSelected}
      />
      <input
        type="file"
        ref={folderInputRef}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderFilesSelected}
      />

      {/* VIEW A: World Options View (Reference: media_1791714853544_f462a2bc.png) */}
      {viewingOptionsForWorld ? (
        <div>
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={closeOptionsView}
                className="px-3.5 py-2 rounded-component bg-gray-800 hover:bg-gray-750 text-gray-200 hover:text-white border border-gray-600/60 text-sm font-semibold flex items-center gap-2 transition-all shadow"
              >
                <FontAwesomeIcon icon={faArrowLeft} />
                <span>Back to Worlds</span>
              </button>
              <h1 className="text-2xl font-bold text-arix">
                Worlds <span className="text-gray-400 font-normal text-lg">/ {viewingOptionsForWorld}</span>
              </h1>
            </div>

            {/* Quick search for gamerules */}
            <div className="relative w-full sm:w-72">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"
              />
              <input
                type="text"
                value={gameruleSearch}
                onChange={(e) => setGameruleSearch(e.target.value)}
                placeholder="Search gamerules..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800/90 border border-gray-600/70 rounded-component text-sm text-white placeholder-gray-400 focus:outline-none focus:border-arix transition-all"
              />
            </div>
          </div>

          {optionsLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-arix mb-3" />
              <p className="text-sm">Loading world configuration & gamerules...</p>
            </div>
          ) : !optionsData ? (
            <div className="bg-gray-700 backdrop boxBorder rounded-box p-8 text-center text-gray-400">
              Failed to load options for this world.
            </div>
          ) : (
            <div>
              {/* TOP CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Seed Card */}
                <div className="bg-gray-700 backdrop boxBorder rounded-box p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-white">Seed</span>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#1e252b] border border-gray-600/70">
                      <FontAwesomeIcon icon={faMountain} className="text-sky-400 text-sm" />
                      <span className="font-mono text-sm font-semibold text-white tracking-wide">
                        {optionsData.seed || '0'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopySeed(optionsData.seed)}
                        title="Copy seed"
                        className="ml-1 text-gray-400 hover:text-white transition-colors"
                      >
                        <FontAwesomeIcon icon={copiedSeed ? faCheck : faCopy} className={copiedSeed ? 'text-emerald-400 text-xs' : 'text-xs'} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    seed: {optionsData.seed || 'none'}
                  </div>
                </div>

                {/* Hardcore Card */}
                <div className="bg-gray-700 backdrop boxBorder rounded-box p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-white">Hardcore</span>
                    <AternosToggle
                      value={optionsData.hardcore}
                      onChange={handleUpdateHardcore}
                    />
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    hardcore: {optionsData.hardcore ? 'true' : 'false'}
                  </div>
                </div>

                {/* Difficulty Card */}
                <div className="bg-gray-700 backdrop boxBorder rounded-box p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-white">Difficulty</span>
                    <select
                      value={optionsData.difficulty.toLowerCase()}
                      onChange={(e) => handleUpdateDifficulty(e.target.value)}
                      className="px-3 py-1.5 rounded bg-[#1e252b] border border-gray-600/70 text-sm font-semibold text-white focus:outline-none focus:border-arix"
                    >
                      <option value="peaceful">Peaceful</option>
                      <option value="easy">Easy</option>
                      <option value="normal">Normal</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    difficulty: {optionsData.difficulty}
                  </div>
                </div>

                {/* Enabled Features Card */}
                <div className="bg-gray-700 backdrop boxBorder rounded-box p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-white">Enabled features</span>
                  </div>
                  <div className="bg-[#1e252b] rounded p-2.5 flex flex-wrap gap-2 mb-2 border border-gray-600/60">
                    {optionsData.enabled_features.map((feat) => (
                      <span
                        key={feat}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-200 border border-gray-700"
                      >
                        <span>{feat}</span>
                        <FontAwesomeIcon icon={faTimes} className="text-[10px] text-gray-400 cursor-pointer hover:text-white" />
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    enabled_features: minecraft:vanilla
                  </div>
                </div>

                {/* Enabled Datapacks Card */}
                <div className="bg-gray-700 backdrop boxBorder rounded-box p-4 flex flex-col justify-between md:col-span-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-white">Enabled datapacks</span>
                  </div>
                  <div className="bg-[#1e252b] rounded p-2.5 flex flex-wrap gap-2 mb-2 border border-gray-600/60 min-h-[44px]">
                    {optionsData.enabled_datapacks.map((dp) => (
                      <span
                        key={dp}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-200 border border-gray-700"
                      >
                        <span>{dp}</span>
                        <FontAwesomeIcon icon={faTimes} className="text-[10px] text-gray-400 cursor-pointer hover:text-white" />
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    Enabled: {optionsData.enabled_datapacks.join(', ')}
                  </div>
                </div>

                {/* Disabled Datapacks Card */}
                <div className="bg-gray-700 backdrop boxBorder rounded-box p-4 flex flex-col justify-between md:col-span-2">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-base font-bold text-white">Disabled datapacks</span>
                  </div>
                  <div className="bg-[#1e252b] rounded p-2.5 flex flex-wrap gap-2 mb-2 border border-gray-600/60 min-h-[44px]">
                    {optionsData.disabled_datapacks.map((dp) => (
                      <span
                        key={dp}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-200 border border-gray-700"
                      >
                        <span>{dp}</span>
                        <FontAwesomeIcon icon={faTimes} className="text-[10px] text-gray-400 cursor-pointer hover:text-white" />
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 font-mono">
                    Disabled: {optionsData.disabled_datapacks.join(', ')}
                  </div>
                </div>
              </div>

              {/* GAMERULES SECTION */}
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <FontAwesomeIcon icon={faSlidersH} className="text-xl text-arix" />
                  <h2 className="text-xl font-bold text-white">Gamerules</h2>
                </div>

                {filteredGamerules.length === 0 ? (
                  <div className="bg-gray-700 backdrop boxBorder rounded-box p-8 text-center text-gray-400">
                    No gamerules match '{gameruleSearch}'.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {filteredGamerules.map(([rule, val]) => {
                      const isBoolean = typeof val === 'boolean';
                      return (
                        <div
                          key={rule}
                          className="bg-gray-700 backdrop boxBorder rounded-box p-3.5 flex items-center justify-between gap-4 shadow-sm hover:border-gray-600 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-white truncate tracking-wide">
                              {rule}
                            </div>
                            <div className="text-xs font-mono text-gray-400 truncate mt-0.5">
                              minecraft:{rule}: {String(val)}
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isBoolean ? (
                              <AternosToggle
                                value={val as boolean}
                                onChange={(next) => handleUpdateGamerule(rule, next)}
                              />
                            ) : (
                              <NumericStepper
                                value={val as number}
                                onChange={(next) => handleUpdateGamerule(rule, next)}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* VIEW B: Main Worlds List View (Reference: media_1791714755997_b7a37a06.png) */
        <div>
          {/* Header Bar */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-arix">Worlds</h1>
            <button
              type="button"
              onClick={() => {
                setTargetWorldForGenerate('world');
                setGenerateModalOpen(true);
              }}
              className="px-4 py-2 rounded-component bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg transition-all"
            >
              <FontAwesomeIcon icon={faSyncAlt} />
              <span>Generate New World</span>
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-arix mb-3" />
              <p className="text-sm">Detecting Minecraft worlds and dimensions...</p>
            </div>
          ) : !data || data.worlds.length === 0 ? (
            <div className="bg-gray-700 backdrop boxBorder rounded-box p-12 text-center text-gray-400">
              <FontAwesomeIcon icon={faGlobeAmericas} className="text-5xl text-gray-500 mb-3" />
              <p className="text-base font-semibold text-gray-300">No Minecraft worlds detected.</p>
              <p className="text-xs text-gray-400 mt-1">
                Start your server once or click "Generate New World" above to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.worlds.map((world) => {
                const isActive = world.is_active;
                const isAuxiliary = world.name.endsWith('_nether') || world.name.endsWith('_the_end') || !isActive;
                const isUploading = actionLoading === `upload-${world.name}`;
                const isDownloading = actionLoading === `download-${world.name}`;

                return (
                  <div
                    key={world.name}
                    className="bg-gray-700 backdrop boxBorder rounded-box p-5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-5 transition-all"
                  >
                    {/* LEFT SECTION: Icon + World Name */}
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shrink-0 shadow-md">
                        <FontAwesomeIcon icon={faGlobeAmericas} className="text-[#20272c] text-3xl" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold text-white tracking-wide">
                            {world.name}
                          </span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {world.name.endsWith('_nether')
                            ? 'Nether Dimension'
                            : world.name.endsWith('_the_end')
                            ? 'The End Dimension'
                            : 'Overworld / Main Dimension'}
                        </div>
                      </div>
                    </div>

                    {/* MIDDLE SECTION: Force upgrade & Optimize toggles */}
                    <div className="flex flex-col gap-2.5 items-end justify-center w-full md:w-auto">
                      {/* Force Upgrade (Only on active world or main world) */}
                      {isActive && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-200">
                            <span>Force upgrade</span>
                            <FontAwesomeIcon
                              icon={faQuestionCircle}
                              className="text-gray-400 text-xs cursor-help"
                              title="Runs chunk format conversion to current server version on next boot, eliminating chunk loading lag."
                            />
                          </div>
                          <AternosToggle
                            value={world.force_upgrade}
                            onChange={(next) => handleToggleForceUpgrade(world.name, next)}
                            disabled={actionLoading === `force-${world.name}`}
                          />
                        </div>
                      )}

                      {/* Optimize (Available on all worlds) */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-200">
                          <span>Optimize</span>
                          <FontAwesomeIcon
                            icon={faQuestionCircle}
                            className="text-gray-400 text-xs cursor-help"
                            title="Aternos-inspired smart performance tuning: optimizes simulation distance to 6 chunks and view distance to 8 chunks for silky smooth FPS without vanilla compromises."
                          />
                        </div>
                        <AternosToggle
                          value={world.optimized}
                          onChange={(next) => handleToggleOptimize(world.name, next)}
                          disabled={actionLoading === `optimize-${world.name}`}
                        />
                      </div>
                    </div>

                    {/* RIGHT SECTION: Action Buttons Column matching user screenshots */}
                    <div className="flex flex-col gap-2 w-full md:w-36 shrink-0 relative">
                      {/* Download */}
                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownloadWorld(world.name)}
                        className="w-full bg-[#0284c7] hover:bg-[#0369a1] text-white text-xs font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                      >
                        <FontAwesomeIcon icon={isDownloading ? faSpinner : faDownload} spin={isDownloading} />
                        <span>Download</span>
                      </button>

                      {/* Upload with dropdown popup */}
                      <div className="relative">
                        <button
                          type="button"
                          disabled={isUploading}
                          onClick={() =>
                            setUploadMenuOpenFor(uploadMenuOpenFor === world.name ? null : world.name)
                          }
                          className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                        >
                          <FontAwesomeIcon icon={isUploading ? faSpinner : faUpload} spin={isUploading} />
                          <span>Upload</span>
                        </button>

                        {/* Upload Dropdown Popup */}
                        {uploadMenuOpenFor === world.name && (
                          <div className="absolute top-full right-0 mt-1 z-30 bg-[#ea580c] rounded shadow-2xl py-1 w-36 border border-orange-400/30">
                            <button
                              type="button"
                              onClick={() => {
                                uploadTargetWorldRef.current = world.name;
                                setUploadMenuOpenFor(null);
                                if (folderInputRef.current) folderInputRef.current.click();
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faFolder} />
                              <span>Folder</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                uploadTargetWorldRef.current = world.name;
                                setUploadMenuOpenFor(null);
                                if (zipInputRef.current) zipInputRef.current.click();
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 flex items-center gap-2"
                            >
                              <FontAwesomeIcon icon={faFileArchive} />
                              <span>ZIP Archive</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Options */}
                      <button
                        type="button"
                        onClick={() => openOptionsView(world.name)}
                        className="w-full bg-[#f1f5f9] hover:bg-white text-gray-900 text-xs font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <FontAwesomeIcon icon={faSlidersH} />
                        <span>Options</span>
                      </button>

                      {/* Files */}
                      <a
                        href={`/server/${uuid}/files#/${encodeURIComponent(world.name)}`}
                        className="w-full bg-[#f1f5f9] hover:bg-white text-gray-900 text-xs font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <FontAwesomeIcon icon={faFolderOpen} />
                        <span>Files</span>
                      </a>

                      {/* Generate (Active world) OR Delete (Auxiliary/Inactive world) */}
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() => {
                            setTargetWorldForGenerate(world.name);
                            setGenerateModalOpen(true);
                          }}
                          className="w-full bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-all shadow-sm"
                        >
                          <FontAwesomeIcon icon={faSyncAlt} />
                          <span>Generate</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setTargetWorldForDelete(world.name);
                            setDeleteModalOpen(true);
                          }}
                          className="w-full bg-[#e11d48] hover:bg-[#be123c] text-white text-xs font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-2 transition-all shadow-sm"
                        >
                          <FontAwesomeIcon icon={faTrashAlt} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* GENERATE CONFIRMATION MODAL */}
      {generateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-box max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
                <FontAwesomeIcon icon={faExclamationTriangle} />
              </div>
              <h3 className="text-lg font-bold text-white">Generate World: {targetWorldForGenerate}</h3>
            </div>

            <div className="p-3.5 rounded bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 mb-4 leading-relaxed">
              <strong>Warning:</strong> Generating a new world will wipe and replace existing terrain and structures for this world on next startup. Player builds and inventories in this world will be replaced!
            </div>

            <div className="space-y-4 mb-6">
              {/* Seed */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  World Seed (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={generateSeed}
                    onChange={(e) => setGenerateSeed(e.target.value)}
                    placeholder="Leave blank for random seed..."
                    className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-component text-sm text-white focus:outline-none focus:border-arix"
                  />
                  <button
                    type="button"
                    onClick={() => setGenerateSeed(String(Math.floor(Math.random() * 9000000000000000) - 4500000000000000))}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-650 text-white rounded-component text-xs flex items-center gap-1.5"
                    title="Generate random seed"
                  >
                    <FontAwesomeIcon icon={faDice} />
                    <span>Random</span>
                  </button>
                </div>
              </div>

              {/* World Type */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  World Type
                </label>
                <select
                  value={generateWorldType}
                  onChange={(e) => setGenerateWorldType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-component text-sm text-white focus:outline-none focus:border-arix"
                >
                  <option value="default">Default (Vanilla standard)</option>
                  <option value="flat">Superflat</option>
                  <option value="large_biomes">Large Biomes</option>
                  <option value="amplified">Amplified</option>
                  <option value="single_biome_surface">Single Biome</option>
                </select>
              </div>

              {/* Backup toggle */}
              <div className="flex items-center gap-2.5 p-3 rounded bg-gray-900/60 border border-gray-700/60">
                <input
                  type="checkbox"
                  id="gen-backup-check"
                  checked={generateBackup}
                  onChange={(e) => setGenerateBackup(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-0 w-4 h-4"
                />
                <label htmlFor="gen-backup-check" className="text-xs text-gray-200 cursor-pointer select-none">
                  Automatically create a <strong>.zip backup</strong> of current world before regenerating
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setGenerateModalOpen(false)}
                className="px-4 py-2 rounded-component bg-gray-700 hover:bg-gray-650 text-gray-300 text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateConfirm}
                disabled={actionLoading === 'generating'}
                className="px-4 py-2 rounded-component bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg transition-all"
              >
                {actionLoading === 'generating' && <FontAwesomeIcon icon={faSpinner} spin />}
                <span>Regenerate World</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalOpen && targetWorldForDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-box max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg">
                <FontAwesomeIcon icon={faTrashAlt} />
              </div>
              <h3 className="text-lg font-bold text-white">Delete World</h3>
            </div>

            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              Are you sure you want to permanently delete world <strong>'{targetWorldForDelete}'</strong>?
              All chunk region files and dimension data will be erased. This action cannot be reversed.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setTargetWorldForDelete(null);
                }}
                className="px-4 py-2 rounded-component bg-gray-700 hover:bg-gray-650 text-gray-300 text-sm font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={actionLoading === `delete-${targetWorldForDelete}`}
                className="px-4 py-2 rounded-component bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold flex items-center gap-2 shadow-lg transition-all"
              >
                {actionLoading === `delete-${targetWorldForDelete}` && <FontAwesomeIcon icon={faSpinner} spin />}
                <span>Delete World</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </ServerContentBlock>
  );
}
