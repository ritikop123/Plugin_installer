import React, { useEffect, useState, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGlobe,
  faFire,
  faDragon,
  faPlus,
  faCheck,
  faSync,
  faTrash,
  faFileArchive,
  faExclamationTriangle,
  faCompass,
  faShieldAlt,
  faGamepad,
  faCopy,
  faSpinner,
  faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';

interface WorldItem {
  name: string;
  is_active: boolean;
  size: number;
  modified_at?: string;
  has_level_dat: boolean;
  has_overworld: boolean;
  has_nether: boolean;
  nether_type: 'folder' | 'subfolder' | 'none';
  has_end: boolean;
  end_type: 'folder' | 'subfolder' | 'none';
}

interface WorldDataResponse {
  active_world: string;
  seed: string;
  difficulty: string;
  gamemode: string;
  hardcore: boolean;
  worlds: WorldItem[];
}

export default function WorldManagerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<WorldDataResponse | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSeed, setCopiedSeed] = useState<boolean>(false);

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [newWorldName, setNewWorldName] = useState<string>('');
  const [newWorldSeed, setNewWorldSeed] = useState<string>('');

  const fetchWorlds = useCallback(() => {
    setLoading(true);
    http.get<WorldDataResponse>(`/api/client/servers/${uuid}/worlds`)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to load world data from server.',
        });
      })
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => {
    fetchWorlds();
  }, [fetchWorlds]);

  const handleSetActive = (worldName: string) => {
    setActionLoading(`active-${worldName}`);
    setNotice(null);

    http.post(`/api/client/servers/${uuid}/worlds/active`, { world: worldName })
      .then((res: any) => {
        setNotice({
          success: true,
          message: res.data?.message || `Active world updated to '${worldName}'. Restart server to load.`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to set active world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  const handleResetDimension = (worldName: string, dimension: 'nether' | 'end') => {
    const dimTitle = dimension === 'nether' ? 'The Nether' : 'The End';
    if (!confirm(`Are you sure you want to reset ${dimTitle} for '${worldName}'? All structures and player builds in this dimension will be deleted and fresh chunks will generate.`)) {
      return;
    }

    setActionLoading(`reset-${dimension}-${worldName}`);
    setNotice(null);

    http.post(`/api/client/servers/${uuid}/worlds/reset-dimension`, { world: worldName, dimension })
      .then((res: any) => {
        setNotice({
          success: true,
          message: res.data?.message || `${dimTitle} reset successfully!`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || `Failed to reset ${dimTitle}.`,
        });
      })
      .finally(() => setActionLoading(null));
  };

  const handleDeleteWorld = (worldName: string) => {
    if (!confirm(`Are you sure you want to permanently delete world '${worldName}' and all its dimension files? This action cannot be undone.`)) {
      return;
    }

    setActionLoading(`delete-${worldName}`);
    setNotice(null);

    http.post(`/api/client/servers/${uuid}/worlds/delete`, { world: worldName })
      .then((res: any) => {
        setNotice({
          success: true,
          message: res.data?.message || `World '${worldName}' deleted successfully.`,
        });
        fetchWorlds();
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to delete world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  const handleBackupWorld = (worldName: string) => {
    setActionLoading(`backup-${worldName}`);
    setNotice(null);

    http.post(`/api/client/servers/${uuid}/worlds/backup`, { world: worldName })
      .then((res: any) => {
        setNotice({
          success: true,
          message: res.data?.message || `Backup created successfully for '${worldName}'.`,
        });
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to backup world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  const handleCreateWorld = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorldName.trim()) return;

    setActionLoading('create-world');
    setNotice(null);

    http.post(`/api/client/servers/${uuid}/worlds/create`, {
      name: newWorldName.trim(),
      seed: newWorldSeed.trim(),
    })
      .then((res: any) => {
        setNotice({
          success: true,
          message: res.data?.message || `World '${newWorldName}' created and set active!`,
        });
        setCreateModalOpen(false);
        setNewWorldName('');
        setNewWorldSeed('');
        fetchWorlds();
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to create new world.',
        });
      })
      .finally(() => setActionLoading(null));
  };

  const copySeed = (seedText: string) => {
    navigator.clipboard.writeText(seedText);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const activeWorldItem = data?.worlds?.find((w) => w.is_active);

  return (
    <ServerContentBlock title={'World Manager'} showFlashKey={'world-manager'}>
      <div className={'my-6'}>
        {/* Header */}
        <div className={'flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6'}>
          <div>
            <div className={'flex items-center gap-3'}>
              <div className={'w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg shadow-lg shadow-emerald-500/10'}>
                <FontAwesomeIcon icon={faGlobe} />
              </div>
              <div>
                <h2 className={'text-xl font-bold text-neutral-100 tracking-tight'}>Minecraft World Manager</h2>
                <p className={'text-xs text-neutral-400 mt-0.5'}>
                  Manage world saves, switch active levels, reset dimensions, and create backups.
                </p>
              </div>
            </div>
          </div>

          <div className={'flex items-center gap-2.5'}>
            <button
              onClick={() => setCreateModalOpen(true)}
              className={'px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer'}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>Create World</span>
            </button>
            <button
              onClick={fetchWorlds}
              disabled={loading}
              className={'px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 transition-colors flex items-center gap-1.5 cursor-pointer'}
              title="Refresh World Status"
            >
              <FontAwesomeIcon icon={faSync} spin={loading} className={loading ? 'text-cyan-400' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Notice Alert */}
        {notice && (
          <div className={`p-4 rounded-xl border text-xs font-medium mb-6 flex items-center justify-between gap-3 ${
            notice.success
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}>
            <div className={'flex items-center gap-2.5 min-w-0'}>
              <FontAwesomeIcon icon={notice.success ? faCheckCircle : faExclamationTriangle} className={notice.success ? 'text-emerald-400' : 'text-red-400'} />
              <span>{notice.message}</span>
            </div>
            <button onClick={() => setNotice(null)} className={'opacity-70 hover:opacity-100 text-sm font-bold'}>
              ✕
            </button>
          </div>
        )}

        {loading && !data ? (
          <div className={'flex flex-col items-center justify-center py-24 text-neutral-400 gap-3'}>
            <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-emerald-400'} />
            <span className={'text-sm font-medium'}>Scanning world directories on server...</span>
          </div>
        ) : (
          <>
            {/* ACTIVE WORLD SPOTLIGHT CARD */}
            <div className={'bg-gradient-to-br from-neutral-800/90 to-neutral-900/90 border border-emerald-500/40 rounded-2xl p-6 mb-8 shadow-xl relative overflow-hidden backdrop-blur-md'}>
              <div className={'absolute -right-8 -top-8 w-44 h-44 rounded-full bg-emerald-500/5 blur-2xl pointer-events-none'} />

              <div className={'flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10'}>
                {/* Left: Active Info */}
                <div className={'flex-1 min-w-0'}>
                  <div className={'flex items-center gap-2.5 mb-2'}>
                    <span className={'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}>
                      <span className={'w-2 h-2 rounded-full bg-emerald-400 animate-pulse'} />
                      ACTIVE WORLD
                    </span>
                    <span className={'text-xs text-neutral-400 font-mono'}>level-name: {data?.active_world}</span>
                  </div>

                  <h3 className={'text-2xl font-extrabold text-white tracking-tight mb-3 truncate'}>
                    {data?.active_world}
                  </h3>

                  {/* Seed & Meta badges */}
                  <div className={'flex flex-wrap items-center gap-2.5 text-xs text-neutral-300'}>
                    {data?.seed && (
                      <div className={'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700/80'}>
                        <FontAwesomeIcon icon={faCompass} className={'text-amber-400'} />
                        <span className={'font-mono text-neutral-200 truncate max-w-[200px]'}>Seed: {data.seed}</span>
                        <button
                          onClick={() => copySeed(data.seed)}
                          className={'text-neutral-400 hover:text-white transition-colors cursor-pointer'}
                          title="Copy Seed"
                        >
                          <FontAwesomeIcon icon={copiedSeed ? faCheck : faCopy} className={copiedSeed ? 'text-emerald-400' : ''} />
                        </button>
                      </div>
                    )}

                    <div className={'px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700/80 capitalize flex items-center gap-1.5'}>
                      <FontAwesomeIcon icon={faGamepad} className={'text-sky-400'} />
                      <span>{data?.gamemode || 'Survival'}</span>
                    </div>

                    <div className={'px-3 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700/80 capitalize flex items-center gap-1.5'}>
                      <FontAwesomeIcon icon={faShieldAlt} className={'text-purple-400'} />
                      <span>{data?.difficulty || 'Normal'}</span>
                      {data?.hardcore && <span className={'text-red-400 font-bold ml-1'}>• Hardcore</span>}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Dimension Resets */}
                <div className={'flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0'}>
                  <button
                    onClick={() => handleResetDimension(data?.active_world || 'world', 'nether')}
                    disabled={actionLoading === `reset-nether-${data?.active_world}`}
                    className={'px-3.5 py-2.5 bg-red-950/40 hover:bg-red-900/50 border border-red-500/40 text-red-300 hover:text-red-100 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer'}
                    title="Delete Nether files to regenerate fresh Nether terrain"
                  >
                    <FontAwesomeIcon icon={faFire} className={'text-red-400'} />
                    <span>Reset Nether</span>
                  </button>

                  <button
                    onClick={() => handleResetDimension(data?.active_world || 'world', 'end')}
                    disabled={actionLoading === `reset-end-${data?.active_world}`}
                    className={'px-3.5 py-2.5 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/40 text-purple-300 hover:text-purple-100 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer'}
                    title="Delete The End files to respawn Dragon and regenerate End Cities"
                  >
                    <FontAwesomeIcon icon={faDragon} className={'text-purple-400'} />
                    <span>Reset The End</span>
                  </button>

                  <button
                    onClick={() => handleBackupWorld(data?.active_world || 'world')}
                    disabled={actionLoading === `backup-${data?.active_world}`}
                    className={'px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer'}
                    title="Compress world into a .tar.gz archive"
                  >
                    <FontAwesomeIcon icon={faFileArchive} className={'text-cyan-400'} />
                    <span>Backup World</span>
                  </button>
                </div>
              </div>
            </div>

            {/* AVAILABLE WORLDS LIST */}
            <div className={'mb-4 flex items-center justify-between'}>
              <div>
                <h4 className={'text-base font-bold text-neutral-100'}>Detected Worlds on Server</h4>
                <p className={'text-xs text-neutral-400'}>
                  Click "Make Active" to switch your server to another world save.
                </p>
              </div>
              <span className={'text-xs font-mono text-neutral-400'}>
                {data?.worlds?.length || 0} world{(data?.worlds?.length || 0) === 1 ? '' : 's'} detected
              </span>
            </div>

            <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
              {data?.worlds?.map((world) => {
                const isActive = world.is_active;

                return (
                  <div
                    key={world.name}
                    className={`rounded-xl p-5 border flex flex-col justify-between transition-all duration-200 ${
                      isActive
                        ? 'bg-neutral-800/80 border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                        : 'bg-neutral-800/40 border-neutral-700/60 hover:border-neutral-600'
                    }`}
                  >
                    <div>
                      <div className={'flex items-start justify-between gap-3 mb-3'}>
                        <div className={'flex items-center gap-3 min-w-0'}>
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-base shrink-0 ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-neutral-700/40 text-neutral-400 border border-neutral-600/40'
                          }`}>
                            <FontAwesomeIcon icon={faGlobe} />
                          </div>
                          <div className={'min-w-0'}>
                            <h4 className={'font-bold text-neutral-100 text-sm truncate'} title={world.name}>
                              {world.name}
                            </h4>
                            <p className={'text-[11px] text-neutral-400 font-mono mt-0.5'}>
                              {world.has_level_dat ? 'Valid level.dat' : 'Custom Directory'}
                            </p>
                          </div>
                        </div>

                        {isActive ? (
                          <span className={'px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}>
                            Active
                          </span>
                        ) : null}
                      </div>

                      {/* Dimension pill indicators */}
                      <div className={'flex flex-wrap gap-1.5 mb-4 text-[11px]'}>
                        <span className={'px-2 py-0.5 rounded bg-neutral-900/70 border border-neutral-700/60 text-emerald-400 font-medium'}>
                          🌲 Overworld
                        </span>
                        {world.has_nether && (
                          <span className={'px-2 py-0.5 rounded bg-neutral-900/70 border border-neutral-700/60 text-red-400 font-medium'}>
                            🔥 Nether
                          </span>
                        )}
                        {world.has_end && (
                          <span className={'px-2 py-0.5 rounded bg-neutral-900/70 border border-neutral-700/60 text-purple-400 font-medium'}>
                            🌌 The End
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className={'pt-3 border-t border-neutral-700/40 flex items-center justify-between gap-2'}>
                      {isActive ? (
                        <span className={'text-xs text-emerald-400 font-semibold flex items-center gap-1.5'}>
                          <FontAwesomeIcon icon={faCheck} /> Currently Active
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetActive(world.name)}
                          disabled={actionLoading === `active-${world.name}`}
                          className={'px-3 py-1.5 bg-[#034f80] hover:bg-[#023e65] text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer'}
                        >
                          Make Active
                        </button>
                      )}

                      <div className={'flex items-center gap-1.5'}>
                        <button
                          onClick={() => handleBackupWorld(world.name)}
                          disabled={actionLoading === `backup-${world.name}`}
                          className={'p-1.5 bg-neutral-700/40 hover:bg-neutral-700/70 border border-neutral-600/50 text-cyan-300 text-xs rounded-lg transition-colors cursor-pointer'}
                          title={`Backup ${world.name}`}
                        >
                          <FontAwesomeIcon icon={actionLoading === `backup-${world.name}` ? faSpinner : faFileArchive} spin={actionLoading === `backup-${world.name}`} />
                        </button>

                        {!isActive && (
                          <button
                            onClick={() => handleDeleteWorld(world.name)}
                            disabled={actionLoading === `delete-${world.name}`}
                            className={'p-1.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 text-xs rounded-lg transition-colors cursor-pointer'}
                            title={`Delete ${world.name}`}
                          >
                            <FontAwesomeIcon icon={actionLoading === `delete-${world.name}` ? faSpinner : faTrash} spin={actionLoading === `delete-${world.name}`} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* CREATE WORLD MODAL */}
        {createModalOpen && (
          <div className={'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'}>
            <div className={'bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden'}>
              <div className={'flex items-center justify-between px-5 py-4 border-b border-neutral-800'}>
                <div className={'flex items-center gap-2.5'}>
                  <div className={'w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-sm'}>
                    <FontAwesomeIcon icon={faPlus} />
                  </div>
                  <h3 className={'text-sm font-bold text-neutral-100'}>Create / Generate New World</h3>
                </div>
                <button onClick={() => setCreateModalOpen(false)} className={'text-neutral-400 hover:text-white'}>
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateWorld} className={'p-5 flex flex-col gap-4'}>
                <div>
                  <label className={'block text-xs font-semibold text-neutral-300 mb-1.5'}>
                    World Name <span className={'text-red-400'}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newWorldName}
                    onChange={(e) => setNewWorldName(e.target.value)}
                    placeholder="e.g. survival_v2, lobby, hardcore"
                    className={'w-full py-2 px-3 bg-neutral-950 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-emerald-500'}
                  />
                  <p className={'text-[11px] text-neutral-500 mt-1'}>
                    Letters, numbers, hyphens, and underscores only.
                  </p>
                </div>

                <div>
                  <label className={'block text-xs font-semibold text-neutral-300 mb-1.5'}>
                    Custom World Seed <span className={'text-neutral-500'}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newWorldSeed}
                    onChange={(e) => setNewWorldSeed(e.target.value)}
                    placeholder="e.g. 123456789 or leave empty for random"
                    className={'w-full py-2 px-3 bg-neutral-950 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-emerald-500'}
                  />
                  <p className={'text-[11px] text-neutral-500 mt-1'}>
                    Leave blank to generate a completely random seed.
                  </p>
                </div>

                <div className={'p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-start gap-2'}>
                  <FontAwesomeIcon icon={faCheckCircle} className={'mt-0.5 shrink-0'} />
                  <span>
                    Setting a new world name will configure <code className={'text-white font-mono'}>level-name</code> in server.properties. Upon server restart, Minecraft will automatically generate fresh terrain for this world.
                  </span>
                </div>

                <div className={'flex items-center justify-end gap-2.5 pt-2'}>
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className={'px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 transition-colors'}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading === 'create-world'}
                    className={'px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition-colors flex items-center gap-1.5'}
                  >
                    <FontAwesomeIcon icon={actionLoading === 'create-world' ? faSpinner : faPlus} spin={actionLoading === 'create-world'} />
                    <span>Create & Set Active</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
