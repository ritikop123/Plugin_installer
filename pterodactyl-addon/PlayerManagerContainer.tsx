import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faUserSlash,
  faCircle,
  faShieldAlt,
  faSignOutAlt,
  faGavel,
  faHeartbeat,
  faUtensils,
  faSyncAlt,
  faSearch,
  faTimes,
  faCheckCircle,
  faExclamationTriangle,
  faCube,
  faSkull,
  faCopy,
  faCheck,
  faUnlockAlt,
  faTh,
  faBoxArchive,
  faGlobeAmericas,
  faMapMarkerAlt,
  faClock,
  faCrosshairs,
  faTrashAlt,
  faCompass,
  faLocationArrow,
} from '@fortawesome/free-solid-svg-icons';

interface PlayerSkinInfo {
  skin_type: 'premium' | 'standard' | 'steve';
  skin_name: string;
  skin_url: string;
  avatar_url: string;
  render_3d_url: string;
  is_cracked: boolean;
}

interface PlayerSummary extends PlayerSkinInfo {
  name: string;
  uuid: string;
  is_op: boolean;
  is_banned: boolean;
  is_online: boolean;
  is_whitelisted?: boolean;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
  expires_on?: string;
  inventory?: InventoryItem[];
  ender_chest?: InventoryItem[];
  stats?: {
    health: number;
    food_level: number;
    level: number;
    exp: number;
    game_mode: number;
    dimension: string;
    pos: [number, number, number];
    last_death_location?: { x: number; y: number; z: number; dimension: string } | null;
    last_modified?: string | null;
  };
}

interface InventoryItem {
  slot: number;
  id: string;
  clean_id: string;
  count: number;
  name: string;
  damage?: number;
  enchantments?: Array<{ id: string; lvl: number }>;
  lore?: string[];
}

interface StatItemEntry {
  id: string;
  clean_id: string;
  name: string;
  count: number;
}

interface GameStatistics {
  play_time_seconds: number;
  play_time_formatted: string;
  player_kills: number;
  deaths: number;
  mob_kills: number;
  kdr: string;
  distance_travelled: {
    walked: number;
    sprinted: number;
    crouched: number;
    fallen: number;
    climbed: number;
    walked_under_water: number;
    walked_on_water: number;
  };
  blocks_broken: StatItemEntry[];
  items_used: StatItemEntry[];
  entities_killed: StatItemEntry[];
}

interface PlayerDetailResponse {
  success: boolean;
  name: string;
  uuid: string;
  is_op: boolean;
  is_banned: boolean;
  is_whitelisted?: boolean;
  ban_info?: {
    created: string;
    source: string;
    expires: string;
    reason: string;
  } | null;
  skin_url: string;
  avatar_url: string;
  render_3d_url: string;
  skin_type: 'premium' | 'standard' | 'steve';
  skin_name: string;
  is_cracked: boolean;
  inventory: InventoryItem[];
  ender_chest: InventoryItem[];
  stats: {
    health: number;
    food_level: number;
    level: number;
    exp: number;
    game_mode: number;
    dimension: string;
    pos: [number, number, number];
    last_death_location?: { x: number; y: number; z: number; dimension: string } | null;
    last_modified?: string | null;
  };
  game_statistics?: GameStatistics | null;
}

interface ServerSoftwareInfo {
  id: string;
  name: string;
  category: 'java' | 'bedrock' | 'proxy';
  version?: string | null;
  build?: string | null;
  supports_plugins?: boolean;
  supports_mods?: boolean;
  config_file?: string;
}

interface PlayersApiResponse {
  success: boolean;
  software?: ServerSoftwareInfo;
  server_online: boolean;
  online_count: number;
  max_players: number;
  online_mode: boolean;
  online_players: PlayerSummary[];
  banned_players: PlayerSummary[];
  all_players: PlayerSummary[];
}

const GAMEMODES = [
  { label: 'Survival', value: 'survival', modeIndex: 0 },
  { label: 'Creative', value: 'creative', modeIndex: 1 },
  { label: 'Adventure', value: 'adventure', modeIndex: 2 },
  { label: 'Spectator', value: 'spectator', modeIndex: 3 },
];

export default function PlayerManagerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  // Core list states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'players' | 'banned'>('players');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Server stats & software
  const [software, setSoftware] = useState<ServerSoftwareInfo | null>(null);
  const [serverOnline, setServerOnline] = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [onlineMode, setOnlineMode] = useState(true);

  // Lists
  const [onlinePlayers, setOnlinePlayers] = useState<PlayerSummary[]>([]);
  const [bannedPlayers, setBannedPlayers] = useState<PlayerSummary[]>([]);
  const [allPlayers, setAllPlayers] = useState<PlayerSummary[]>([]);

  // Selected player & details modal
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSummary | null>(null);
  const [playerDetail, setPlayerDetail] = useState<PlayerDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailSyncing, setDetailSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Sub-modals
  const [kickModalOpen, setKickModalOpen] = useState(false);
  const [kickReason, setKickReason] = useState('Kicked by server administrator.');
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banReason, setBanReason] = useState('Banned by server administrator.');
  const [banIpChecked, setBanIpChecked] = useState(false);
  const [teleportModalOpen, setTeleportModalOpen] = useState(false);
  const [teleportCoords, setTeleportCoords] = useState({ x: '', y: '', z: '', target: '' });
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Inventory tab: 'inventory' or 'ender_chest'
  const [inventoryView, setInventoryView] = useState<'inventory' | 'ender_chest'>('inventory');

  // Stats view expansions
  const [showAllBlocks, setShowAllBlocks] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false);

  // Delete player data checkboxes
  const [deleteTargets, setDeleteTargets] = useState<{
    experience: boolean;
    inventory: boolean;
    ender_chest: boolean;
    playerdata: boolean;
    stats: boolean;
    advancements: boolean;
  }>({
    experience: false,
    inventory: false,
    ender_chest: false,
    playerdata: false,
    stats: false,
    advancements: false,
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Show Toast notification helper
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  const isFetchingRef = useRef(false);
  const isDetailFetchingRef = useRef(false);
  const selectedPlayerRef = useRef<PlayerSummary | null>(null);
  selectedPlayerRef.current = selectedPlayer;

  // Fetch all players data from backend
  const loadPlayers = useCallback(
    async (isManualRefresh = false) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      if (isManualRefresh) setRefreshing(true);
      try {
        const res = await http.get<PlayersApiResponse>(`/api/client/servers/${uuid}/players`, {
          timeout: 10000,
        });
        if (res.data.success) {
          if (res.data.software) setSoftware(res.data.software);
          setServerOnline(res.data.server_online);
          setOnlineCount(res.data.online_count);
          setMaxPlayers(res.data.max_players || 20);
          setOnlineMode(res.data.online_mode);
          setOnlinePlayers(res.data.online_players || []);
          setBannedPlayers(res.data.banned_players || []);
          setAllPlayers(res.data.all_players || []);

          // If a player details modal is currently open, refresh their inventory in background
          if (selectedPlayerRef.current && !isDetailFetchingRef.current) {
            loadPlayerDetails(selectedPlayerRef.current, false, false);
          }
        }
      } catch (err) {
        console.error(err);
        if (isManualRefresh) {
          showToast('error', httpErrorToHuman(err));
        }
      } finally {
        isFetchingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uuid, loadPlayerDetails]
  );

  // Synchronize live online players via server console /list command
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await http.post<PlayersApiResponse>(`/api/client/servers/${uuid}/players/action`, {
        action: 'sync',
      });
      if (res.data.success) {
        if (res.data.software) setSoftware(res.data.software);
        setServerOnline(res.data.server_online);
        setOnlineCount(res.data.online_count);
        setMaxPlayers(res.data.max_players || 20);
        setOnlineMode(res.data.online_mode);
        setOnlinePlayers(res.data.online_players || []);
        setBannedPlayers(res.data.banned_players || []);
        setAllPlayers(res.data.all_players || []);
        showToast('success', 'Player list synchronized with server console.');
      }
    } catch (err) {
      console.error(err);
      await loadPlayers(true);
    } finally {
      setSyncing(false);
    }
  };

  // Auto-refresh every 5 seconds seamlessly (only when page is active and not already fetching)
  useEffect(() => {
    loadPlayers();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadPlayers();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadPlayers]);

  // Load single player details, stats and live inventory
  const loadPlayerDetails = useCallback(
    async (player: PlayerSummary, forceLoadingState = false, fresh = false) => {
      if (isDetailFetchingRef.current) return;
      isDetailFetchingRef.current = true;
      if (fresh) {
        setDetailSyncing(true);
      } else if (forceLoadingState || !player.inventory) {
        setLoadingDetail(true);
      }
      try {
        const res = await http.get<PlayerDetailResponse>(`/api/client/servers/${uuid}/players/detail`, {
          params: {
            player: player.name,
            uuid: player.uuid,
            fresh: fresh ? 1 : 0,
          },
          timeout: 10000,
        });
        if (res.data.success) {
          setPlayerDetail(res.data);
          if (fresh) {
            showToast('success', 'Live inventory flushed from server RAM.');
          }
        }
      } catch (err) {
        console.error(err);
        showToast('error', `Failed to load details for ${player.name}: ${httpErrorToHuman(err)}`);
      } finally {
        isDetailFetchingRef.current = false;
        setLoadingDetail(false);
        setDetailSyncing(false);
      }
    },
    [uuid]
  );

  // Open modal for player (Instant opening with optimistic preview)
  const handleSelectPlayer = (player: PlayerSummary) => {
    setSelectedPlayer(player);
    if (player.inventory !== undefined && player.stats !== undefined) {
      setPlayerDetail({
        success: true,
        name: player.name,
        uuid: player.uuid,
        is_op: player.is_op,
        is_banned: player.is_banned,
        is_whitelisted: player.is_whitelisted,
        skin_url: player.skin_url,
        avatar_url: player.avatar_url,
        render_3d_url: player.render_3d_url,
        skin_type: player.skin_type,
        skin_name: player.skin_name,
        is_cracked: player.is_cracked,
        inventory: player.inventory,
        ender_chest: player.ender_chest || [],
        stats: player.stats,
      });
    } else {
      setPlayerDetail(null);
    }
    setInventoryView('inventory');
    setShowAllBlocks(false);
    setShowAllItems(false);
    setDeleteTargets({
      experience: false,
      inventory: false,
      ender_chest: false,
      playerdata: false,
      stats: false,
      advancements: false,
    });
    // Fetch full details + game statistics
    loadPlayerDetails(player, true, false);
  };

  // Close modal
  const handleCloseModal = () => {
    setSelectedPlayer(null);
    setPlayerDetail(null);
  };

  // Execute Player Action
  const executePlayerAction = async (action: string, payload: Record<string, any> = {}) => {
    if (!selectedPlayer) return;
    setActionLoading(action);
    try {
      const res = await http.post(`/api/client/servers/${uuid}/players/action`, {
        action,
        player: selectedPlayer.name,
        uuid: selectedPlayer.uuid,
        ...payload,
      });

      if (res.data.success) {
        showToast('success', res.data.message || `Action ${action} executed.`);
        loadPlayers();
        if (action === 'ban' || action === 'kick') {
          handleCloseModal();
        } else {
          // Re-fetch player details to reflect changes
          loadPlayerDetails(selectedPlayer, false, action === 'heal' || action === 'feed' || action === 'starve');
        }
      }
    } catch (err) {
      console.error(err);
      showToast('error', httpErrorToHuman(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Copy player UUID
  const handleCopyUuid = (uuidToCopy: string) => {
    if (!uuidToCopy) return;
    navigator.clipboard.writeText(uuidToCopy);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  };

  // Combined players map
  const combinedPlayersList = useMemo(() => {
    const map = new Map<string, PlayerSummary>();
    for (const p of allPlayers) {
      map.set(p.name.toLowerCase(), { ...p });
    }
    for (const op of onlinePlayers) {
      const existing = map.get(op.name.toLowerCase());
      if (existing) {
        existing.is_online = true;
        map.set(op.name.toLowerCase(), existing);
      } else {
        map.set(op.name.toLowerCase(), { ...op, is_online: true });
      }
    }
    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.is_online !== b.is_online) {
        return a.is_online ? -1 : 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return list;
  }, [allPlayers, onlinePlayers]);

  const onlinePlayersCount = useMemo(() => {
    return combinedPlayersList.filter((p) => p.is_online).length;
  }, [combinedPlayersList]);

  const offlinePlayersCount = useMemo(() => {
    return combinedPlayersList.filter((p) => !p.is_online).length;
  }, [combinedPlayersList]);

  // Filter players by active tab and search query
  const filteredPlayers = useMemo(() => {
    let list: PlayerSummary[] = [];

    if (activeTab === 'banned') {
      list = [...bannedPlayers];
    } else {
      if (playerFilter === 'online') {
        list = combinedPlayersList.filter((p) => p.is_online);
      } else if (playerFilter === 'offline') {
        list = combinedPlayersList.filter((p) => !p.is_online);
      } else {
        list = [...combinedPlayersList];
      }
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((p) => p.name.toLowerCase().includes(q) || p.uuid.toLowerCase().includes(q));
  }, [activeTab, playerFilter, combinedPlayersList, bannedPlayers, searchQuery]);

  // Helper to get item by slot number
  const getItemAtSlot = (items: InventoryItem[], slot: number): InventoryItem | undefined => {
    return items.find((i) => i.slot === slot);
  };

  // Check if all delete targets selected
  const allDeleteSelected = useMemo(() => {
    return (
      deleteTargets.experience &&
      deleteTargets.inventory &&
      deleteTargets.ender_chest &&
      deleteTargets.playerdata &&
      deleteTargets.stats &&
      deleteTargets.advancements
    );
  }, [deleteTargets]);

  const toggleSelectAllDelete = () => {
    const next = !allDeleteSelected;
    setDeleteTargets({
      experience: next,
      inventory: next,
      ender_chest: next,
      playerdata: next,
      stats: next,
      advancements: next,
    });
  };

  const hasAnyDeleteTarget = useMemo(() => {
    return Object.values(deleteTargets).some(Boolean);
  }, [deleteTargets]);

  // Calculate distance travelled total
  const totalDistance = useMemo(() => {
    if (!playerDetail?.game_statistics?.distance_travelled) return 0;
    const d = playerDetail.game_statistics.distance_travelled;
    return (
      (d.walked || 0) +
      (d.sprinted || 0) +
      (d.crouched || 0) +
      (d.fallen || 0) +
      (d.climbed || 0) +
      (d.walked_under_water || 0) +
      (d.walked_on_water || 0)
    );
  }, [playerDetail]);

  // Calculate blocks broken total
  const totalBlocksBroken = useMemo(() => {
    if (!playerDetail?.game_statistics?.blocks_broken) return 0;
    return playerDetail.game_statistics.blocks_broken.reduce((acc, b) => acc + b.count, 0);
  }, [playerDetail]);

  // Calculate items used total
  const totalItemsUsed = useMemo(() => {
    if (!playerDetail?.game_statistics?.items_used) return 0;
    return playerDetail.game_statistics.items_used.reduce((acc, i) => acc + i.count, 0);
  }, [playerDetail]);

  // Calculate entities killed total
  const totalEntitiesKilled = useMemo(() => {
    if (!playerDetail?.game_statistics?.entities_killed) return 0;
    return playerDetail.game_statistics.entities_killed.reduce((acc, e) => acc + e.count, 0);
  }, [playerDetail]);

  // Active gamemode name
  const currentGamemodeValue = useMemo(() => {
    const mode = playerDetail?.stats?.game_mode ?? 0;
    const match = GAMEMODES.find((g) => g.modeIndex === mode);
    return match ? match.value : 'survival';
  }, [playerDetail?.stats?.game_mode]);

  return (
    <ServerContentBlock
      title="Player Manager"
      description="Live player monitoring, real-time inventory inspection, operator controls, and player statistics."
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
            className="ml-2 text-neutral-400 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}

      {/* Top Header Card: Current / Max Players & Search */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-5 mb-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* Status & Player Count Counter */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-neutral-800/90 border border-neutral-700/60 flex items-center justify-center text-primary-400 shadow-inner">
              <FontAwesomeIcon icon={faUsers} className="text-2xl" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full border bg-neutral-800 text-neutral-300 border-neutral-700">
                  <FontAwesomeIcon
                    icon={faCircle}
                    className={`text-[9px] ${
                      serverOnline ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'
                    }`}
                  />
                  {serverOnline ? 'Server Active' : 'Server Standby'}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  <FontAwesomeIcon icon={faSyncAlt} className="text-[9px] animate-spin" style={{ animationDuration: '5s' }} />
                  <span>5s Live</span>
                </span>
                {software && (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border bg-cyan-950/60 text-cyan-300 border-cyan-700/50 font-medium">
                    <FontAwesomeIcon icon={faCube} className="text-[10px]" />
                    <span>{software.name} {software.version ? software.version : ''}</span>
                  </span>
                )}
                {!onlineMode && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full border bg-amber-950/60 text-amber-300 border-amber-700/50 font-medium">
                    Cracked Mode
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-white">
                  {onlineCount} <span className="text-neutral-500 font-normal text-lg">/ {maxPlayers}</span>
                </span>
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  Players Online
                </span>
              </div>
            </div>
          </div>

          {/* Search and Refresh Actions */}
          <div className="flex items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 text-xs"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players by name or UUID..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 placeholder-neutral-500 text-sm focus:outline-none focus:border-primary-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                </button>
              )}
            </div>

            <button
              onClick={handleSync}
              disabled={syncing || refreshing}
              title="Synchronize live players directly from Minecraft console (/list)"
              className="px-4 py-2.5 rounded-xl bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-sm font-semibold border border-primary-500/40 transition-colors flex items-center gap-2 whitespace-nowrap active:scale-95 shadow-sm"
            >
              <FontAwesomeIcon icon={faSyncAlt} className={`${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync Online</span>
            </button>

            <button
              onClick={() => loadPlayers(true)}
              disabled={refreshing || syncing}
              title="Refresh player list"
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium border border-neutral-700 transition-colors flex items-center gap-2 whitespace-nowrap active:scale-95"
            >
              <FontAwesomeIcon icon={faSyncAlt} className={`${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs & Sub-filter Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 bg-neutral-950 p-1.5 rounded-2xl border border-neutral-800">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'players'
                ? 'bg-primary-600/20 text-primary-400 border border-primary-500/40'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`}
          >
            <FontAwesomeIcon icon={faUsers} />
            <span>Players</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === 'players'
                  ? 'bg-primary-500/30 text-primary-300'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {combinedPlayersList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('banned')}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'banned'
                ? 'bg-rose-950/40 text-rose-400 border border-rose-600/40'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
            }`}
          >
            <FontAwesomeIcon icon={faUserSlash} />
            <span>Banned Players</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                activeTab === 'banned'
                  ? 'bg-rose-500/30 text-rose-300'
                  : 'bg-neutral-800 text-neutral-400'
              }`}
            >
              {bannedPlayers.length}
            </span>
          </button>
        </div>

        {/* Sub-filters for Players Tab */}
        {activeTab === 'players' && (
          <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800 self-start sm:self-auto">
            <button
              onClick={() => setPlayerFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                playerFilter === 'all'
                  ? 'bg-neutral-800 text-white shadow-sm font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              All ({combinedPlayersList.length})
            </button>
            <button
              onClick={() => setPlayerFilter('online')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                playerFilter === 'online'
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40 shadow-sm font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Online ({onlinePlayersCount})
            </button>
            <button
              onClick={() => setPlayerFilter('offline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                playerFilter === 'offline'
                  ? 'bg-neutral-800 text-neutral-200 shadow-sm font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Offline ({offlinePlayersCount})
            </button>
          </div>
        )}
      </div>

      {/* Players Cards Grid */}
      {loading && allPlayers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
          <FontAwesomeIcon icon={faSyncAlt} className="animate-spin text-3xl mb-3 text-primary-400" />
          <p className="text-sm">Querying server for player records...</p>
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-neutral-800/70 border border-neutral-700/60 flex items-center justify-center mx-auto mb-4 text-neutral-400">
            <FontAwesomeIcon icon={activeTab === 'banned' ? faUserSlash : faUsers} className="text-2xl" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">
            {activeTab === 'banned'
              ? 'No Banned Players Found'
              : playerFilter === 'online'
              ? 'No Players Currently Online'
              : 'No Players Found'}
          </h3>
          <p className="text-sm text-neutral-400 max-w-md mx-auto">
            {activeTab === 'banned'
              ? 'Clean record! There are no banned players in banned-players.json.'
              : playerFilter === 'online'
              ? 'None of the server players are currently connected.'
              : 'No players have joined this Minecraft server yet.'}
          </p>
          {activeTab === 'players' && playerFilter === 'online' && combinedPlayersList.length > 0 && (
            <button
              onClick={() => setPlayerFilter('all')}
              className="mt-4 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors"
            >
              View All {combinedPlayersList.length} Server Players
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPlayers.map((player) => (
            <div
              key={`${player.name}-${player.uuid}`}
              onClick={() => handleSelectPlayer(player)}
              className={`group relative bg-neutral-900/90 border rounded-2xl p-4 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-0.5 ${
                player.is_banned
                  ? 'border-rose-900/40 hover:border-rose-500/50 bg-rose-950/10'
                  : player.is_online
                  ? 'border-neutral-800 hover:border-primary-500/50'
                  : 'border-neutral-800/60 hover:border-neutral-700'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="relative flex-shrink-0">
                  <img
                    src={player.avatar_url}
                    alt={player.name}
                    className="w-12 h-12 rounded-xl bg-neutral-950 border border-neutral-700/60 object-cover shadow-sm transition-transform group-hover:scale-105"
                    style={{ imageRendering: 'pixelated' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://mc-heads.net/avatar/MHF_Steve/64';
                    }}
                  />
                  {player.is_online && (
                    <span
                      className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-neutral-900 shadow-sm"
                      title="Online Now"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <h4 className="text-sm font-bold text-white truncate group-hover:text-primary-400 transition-colors">
                      {player.name}
                    </h4>
                    {player.is_op && (
                      <span title="Server Operator" className="text-amber-400 text-xs">
                        <FontAwesomeIcon icon={faShieldAlt} />
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-neutral-400 font-mono truncate mb-1.5">
                    {player.uuid || 'Unknown UUID'}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {player.is_banned ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-rose-950/60 text-rose-300 border border-rose-800/40 text-[10px] font-semibold">
                        Banned
                      </span>
                    ) : player.is_online ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 text-[10px] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md bg-neutral-800 text-neutral-400 text-[10px]">
                        Offline
                      </span>
                    )}

                    {player.skin_type === 'steve' ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-950/50 text-amber-300 border border-amber-800/40 text-[10px]">
                        Steve
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md bg-cyan-950/50 text-cyan-300 border border-cyan-800/40 text-[10px]">
                        Skin
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {player.is_banned && player.reason && (
                <div className="mt-3 pt-2.5 border-t border-rose-900/30 text-xs text-rose-300/80 truncate">
                  <span className="font-semibold text-rose-400">Reason:</span> {player.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ATERNOS-STYLE PROFESSIONAL PLAYER DETAILS MODAL / VIEW                     */}
      {/* ========================================================================= */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-6xl bg-[#1e232d] border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
            
            {/* Modal Top Header Bar */}
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#171b23] border-b border-neutral-800">
              <div className="flex items-center gap-3">
                <span className="text-base sm:text-lg font-bold text-[#4aa3df]">
                  Player details
                </span>
                {detailSyncing && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-950/60 text-primary-300 border border-primary-700/50 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faSyncAlt} className="animate-spin text-[10px]" />
                    <span>Flushing server RAM...</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadPlayerDetails(selectedPlayer, false, true)}
                  disabled={detailSyncing || loadingDetail}
                  title="Force Minecraft server to flush live RAM to disk (save-all) and refresh inventory"
                  className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors flex items-center gap-1.5 active:scale-95"
                >
                  <FontAwesomeIcon icon={faSyncAlt} className={detailSyncing ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">Live RAM Sync</span>
                </button>
                <button
                  onClick={handleCloseModal}
                  className="w-8 h-8 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4">

              {/* 1. TOP PLAYER BANNER (Avatar, Name, Online badge, UUID, Gamemode dropdown) */}
              <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={playerDetail?.avatar_url || selectedPlayer.avatar_url}
                    alt={selectedPlayer.name}
                    className="w-12 h-12 rounded-lg bg-neutral-900 border border-neutral-700 object-cover flex-shrink-0"
                    style={{ imageRendering: 'pixelated' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/64';
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-lg font-bold text-white tracking-wide">
                        {selectedPlayer.name}
                      </span>
                      {selectedPlayer.is_banned ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700 font-semibold">
                          Banned
                        </span>
                      ) : selectedPlayer.is_online ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Online
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 font-semibold">
                          Offline
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono mt-0.5">
                      <span>{selectedPlayer.uuid}</span>
                      <button
                        onClick={() => handleCopyUuid(selectedPlayer.uuid)}
                        title="Copy UUID"
                        className="text-neutral-500 hover:text-white transition-colors"
                      >
                        <FontAwesomeIcon icon={copiedUuid ? faCheck : faCopy} className="text-xs" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Gamemode Dropdown */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <label className="text-xs text-neutral-400 font-medium hidden sm:inline">Gamemode:</label>
                  <select
                    value={currentGamemodeValue}
                    onChange={(e) => executePlayerAction('gamemode', { gamemode: e.target.value })}
                    disabled={actionLoading !== null}
                    className="px-3 py-1.5 rounded-lg bg-[#181d26] border border-neutral-700 text-white text-xs font-semibold focus:outline-none focus:border-primary-500 cursor-pointer"
                  >
                    {GAMEMODES.map((gm) => (
                      <option key={gm.value} value={gm.value}>
                        {gm.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. MIDDLE TWO-COLUMN SECTION */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

                {/* LEFT COLUMN: Health & Experience + Inventory (8 cols) */}
                <div className="lg:col-span-8 flex flex-col gap-4">

                  {/* Health and Experience Box */}
                  <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col gap-3">
                    <div className="text-xs font-bold text-neutral-300">
                      Health and experience
                    </div>

                    {/* Green Experience Bar */}
                    <div className="relative w-full h-8 bg-neutral-900 rounded-md overflow-hidden border border-neutral-700/80 flex items-center justify-between px-2">
                      {/* Minecraft XP Green Progress Background */}
                      <div
                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-600 via-green-500 to-lime-400 transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, (playerDetail?.stats?.exp ?? 0) * 100))}%`,
                        }}
                      />

                      {/* Open Ender Chest / Inventory Switch Button */}
                      <button
                        onClick={() =>
                          setInventoryView(inventoryView === 'inventory' ? 'ender_chest' : 'inventory')
                        }
                        className="relative z-10 px-2.5 py-1 rounded bg-[#1f242e]/90 hover:bg-[#181d26] text-white text-[11px] font-bold border border-neutral-700 shadow transition-colors flex items-center gap-1.5"
                      >
                        <FontAwesomeIcon icon={inventoryView === 'inventory' ? faBoxArchive : faTh} />
                        <span>{inventoryView === 'inventory' ? 'Open Ender Chest' : 'Open Inventory'}</span>
                      </button>

                      {/* Level Indicator (Centered) */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span
                          className="font-bold text-xs text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] select-none"
                          style={{
                            textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                          }}
                        >
                          Level {playerDetail?.stats?.level ?? selectedPlayer.stats?.level ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Controls Row: Kill/Starve Buttons + 10 Hearts & Drumsticks + Heal/Feed Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                      {/* Left: Kill & Starve (Orange/Coral) */}
                      <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => executePlayerAction('kill')}
                          disabled={actionLoading !== null}
                          className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-[#eb6f5e] hover:bg-[#de5d4b] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow"
                        >
                          <FontAwesomeIcon icon={faSkull} className="text-[11px]" />
                          <span>Kill</span>
                        </button>
                        <button
                          onClick={() => executePlayerAction('starve')}
                          disabled={actionLoading !== null}
                          className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-[#eb6f5e] hover:bg-[#de5d4b] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow"
                        >
                          <FontAwesomeIcon icon={faUtensils} className="text-[11px]" />
                          <span>Starve</span>
                        </button>
                      </div>

                      {/* Center: 10 Hearts & 10 Drumsticks */}
                      <div className="flex flex-col items-center gap-2 py-1">
                        {/* 10 Hearts Row */}
                        <div className="flex items-center gap-1 sm:gap-1.5" title={`Health: ${playerDetail?.stats?.health ?? 20} / 20`}>
                          {Array.from({ length: 10 }, (_, i) => {
                            const hp = playerDetail?.stats?.health ?? 20;
                            const full = (i + 1) * 2;
                            const half = i * 2 + 1;
                            const fill = hp >= full ? 'full' : hp >= half ? 'half' : 'empty';
                            return <MinecraftHeart key={i} fill={fill} />;
                          })}
                        </div>

                        {/* 10 Drumsticks Row */}
                        <div className="flex items-center gap-1 sm:gap-1.5" title={`Food: ${playerDetail?.stats?.food_level ?? 20} / 20`}>
                          {Array.from({ length: 10 }, (_, i) => {
                            const food = playerDetail?.stats?.food_level ?? 20;
                            const full = (i + 1) * 2;
                            const half = i * 2 + 1;
                            const fill = food >= full ? 'full' : food >= half ? 'half' : 'empty';
                            return <MinecraftDrumstick key={i} fill={fill} />;
                          })}
                        </div>
                      </div>

                      {/* Right: Heal & Feed (Green) */}
                      <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => executePlayerAction('heal')}
                          disabled={actionLoading !== null}
                          className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-[#27ae60] hover:bg-[#219653] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow"
                        >
                          <FontAwesomeIcon icon={faHeartbeat} className="text-[11px]" />
                          <span>Heal</span>
                        </button>
                        <button
                          onClick={() => executePlayerAction('feed')}
                          disabled={actionLoading !== null}
                          className="flex-1 sm:flex-none px-4 py-1.5 rounded-lg bg-[#27ae60] hover:bg-[#219653] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow"
                        >
                          <FontAwesomeIcon icon={faUtensils} className="text-[11px]" />
                          <span>Feed</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inventory / Ender Chest Container */}
                  <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-neutral-300">
                        {inventoryView === 'inventory' ? 'Inventory' : 'Ender Chest'}
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {inventoryView === 'inventory'
                          ? `${playerDetail?.inventory?.length || 0} items stored`
                          : `${playerDetail?.ender_chest?.length || 0} items stored`}
                      </div>
                    </div>

                    {/* Gray Minecraft Container Background */}
                    <div className="bg-[#c6c6c6] p-3 sm:p-4 rounded-xl border-2 border-[#555] shadow-inner text-neutral-900 overflow-x-auto">
                      {loadingDetail && !playerDetail ? (
                        <div className="flex flex-col items-center justify-center py-12 text-neutral-700">
                          <FontAwesomeIcon icon={faSyncAlt} className="animate-spin text-xl mb-2 text-neutral-800" />
                          <span className="text-xs font-bold">Reading Minecraft inventory...</span>
                        </div>
                      ) : inventoryView === 'inventory' ? (
                        <div className="flex gap-4 sm:gap-6 min-w-max justify-center items-start">
                          {/* Left Column: 4 Armor Slots + Offhand Slot */}
                          <div className="flex flex-col gap-2">
                            <InventorySlot
                              item={
                                getItemAtSlot(playerDetail?.inventory || [], 103) ||
                                getItemAtSlot(playerDetail?.inventory || [], 39)
                              }
                              placeholder="helmet"
                            />
                            <InventorySlot
                              item={
                                getItemAtSlot(playerDetail?.inventory || [], 102) ||
                                getItemAtSlot(playerDetail?.inventory || [], 38)
                              }
                              placeholder="chestplate"
                            />
                            <InventorySlot
                              item={
                                getItemAtSlot(playerDetail?.inventory || [], 101) ||
                                getItemAtSlot(playerDetail?.inventory || [], 37)
                              }
                              placeholder="leggings"
                            />
                            <InventorySlot
                              item={
                                getItemAtSlot(playerDetail?.inventory || [], 100) ||
                                getItemAtSlot(playerDetail?.inventory || [], 36)
                              }
                              placeholder="boots"
                            />
                            <div className="pt-2">
                              <InventorySlot
                                item={
                                  getItemAtSlot(playerDetail?.inventory || [], 150) ||
                                  getItemAtSlot(playerDetail?.inventory || [], -106) ||
                                  getItemAtSlot(playerDetail?.inventory || [], 40)
                                }
                                placeholder="shield"
                              />
                            </div>
                          </div>

                          {/* Center / Right: Main Inventory 3x9 + Hotbar 1x9 */}
                          <div className="flex flex-col gap-3">
                            {/* Main Inventory: 3 rows of 9 slots (slots 9 to 35) */}
                            <div className="grid grid-cols-9 gap-1.5">
                              {Array.from({ length: 27 }, (_, i) => i + 9).map((slotIndex) => (
                                <InventorySlot
                                  key={slotIndex}
                                  item={getItemAtSlot(playerDetail?.inventory || [], slotIndex)}
                                />
                              ))}
                            </div>

                            {/* Hotbar: 1 row of 9 slots (slots 0 to 8) */}
                            <div className="grid grid-cols-9 gap-1.5 pt-1">
                              {Array.from({ length: 9 }, (_, i) => i).map((slotIndex) => (
                                <InventorySlot
                                  key={slotIndex}
                                  item={getItemAtSlot(playerDetail?.inventory || [], slotIndex)}
                                  isHotbar
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Ender Chest: 3 rows of 9 slots (slots 0 to 26) */
                        <div className="flex flex-col items-center gap-3">
                          <div className="grid grid-cols-9 gap-1.5">
                            {Array.from({ length: 27 }, (_, i) => i).map((slotIndex) => (
                              <InventorySlot
                                key={slotIndex}
                                item={getItemAtSlot(playerDetail?.ender_chest || [], slotIndex)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: Control & Information (4 cols) */}
                <div className="lg:col-span-4 flex flex-col gap-4">

                  {/* Control Box */}
                  <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col gap-2.5">
                    <div className="text-xs font-bold text-neutral-300 mb-1">
                      Control
                    </div>

                    {/* Whitelisted */}
                    <div className="bg-[#ffffff] rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-semibold text-neutral-800">
                        Whitelisted
                      </span>
                      <button
                        onClick={() =>
                          executePlayerAction('whitelist', {
                            enable: !playerDetail?.is_whitelisted,
                          })
                        }
                        disabled={actionLoading !== null}
                        title="Toggle Whitelist status"
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white transition-all active:scale-95 ${
                          playerDetail?.is_whitelisted
                            ? 'bg-[#27ae60] hover:bg-[#219653]'
                            : 'bg-[#eb6f5e] hover:bg-[#de5d4b]'
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={playerDetail?.is_whitelisted ? faCheck : faTimes}
                        />
                      </button>
                    </div>

                    {/* Banned */}
                    <div className="bg-[#ffffff] rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-semibold text-neutral-800">
                        Banned
                      </span>
                      <button
                        onClick={() => {
                          if (playerDetail?.is_banned || selectedPlayer.is_banned) {
                            executePlayerAction('unban');
                          } else {
                            setBanModalOpen(true);
                          }
                        }}
                        disabled={actionLoading !== null}
                        title={playerDetail?.is_banned ? 'Unban Player' : 'Ban Player'}
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white transition-all active:scale-95 ${
                          playerDetail?.is_banned || selectedPlayer.is_banned
                            ? 'bg-[#27ae60] hover:bg-[#219653]'
                            : 'bg-[#eb6f5e] hover:bg-[#de5d4b]'
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={
                            playerDetail?.is_banned || selectedPlayer.is_banned
                              ? faCheck
                              : faTimes
                          }
                        />
                      </button>
                    </div>

                    {/* Operator */}
                    <div className="bg-[#ffffff] rounded-lg px-3 py-2 flex items-center justify-between shadow-sm">
                      <span className="text-xs font-semibold text-neutral-800">
                        Operator
                      </span>
                      <button
                        onClick={() =>
                          executePlayerAction(
                            playerDetail?.is_op || selectedPlayer.is_op ? 'deop' : 'op'
                          )
                        }
                        disabled={actionLoading !== null}
                        title="Toggle OP status"
                        className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white transition-all active:scale-95 ${
                          playerDetail?.is_op || selectedPlayer.is_op
                            ? 'bg-[#27ae60] hover:bg-[#219653]'
                            : 'bg-[#eb6f5e] hover:bg-[#de5d4b]'
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={
                            playerDetail?.is_op || selectedPlayer.is_op
                              ? faCheck
                              : faTimes
                          }
                        />
                      </button>
                    </div>
                  </div>

                  {/* Information Box */}
                  <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col gap-3">
                    <div className="text-xs font-bold text-neutral-300">
                      Information
                    </div>

                    {/* Current Position */}
                    <div className="bg-[#181d26] rounded-lg p-3 border border-neutral-700/60 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-200">
                          <FontAwesomeIcon icon={faMapMarkerAlt} className="text-primary-400 text-xs" />
                          <span>Current position</span>
                        </div>
                        <button
                          onClick={() => {
                            const p = playerDetail?.stats?.pos;
                            if (p) {
                              setTeleportCoords({
                                x: String(p[0]),
                                y: String(p[1]),
                                z: String(p[2]),
                                target: '',
                              });
                            }
                            setTeleportModalOpen(true);
                          }}
                          className="px-2.5 py-1 rounded bg-[#2980b9] hover:bg-[#2471a3] text-white text-[11px] font-bold transition-colors flex items-center gap-1 shadow"
                        >
                          <FontAwesomeIcon icon={faLocationArrow} className="text-[10px]" />
                          <span>Teleport</span>
                        </button>
                      </div>

                      <div className="text-xs text-neutral-300 font-mono">
                        {playerDetail?.stats?.pos ? (
                          <>
                            X: <strong>{playerDetail.stats.pos[0]}</strong> / Y:{' '}
                            <strong>{playerDetail.stats.pos[1]}</strong> / Z:{' '}
                            <strong>{playerDetail.stats.pos[2]}</strong>
                          </>
                        ) : (
                          'X: 0 / Y: 64 / Z: 0'
                        )}
                      </div>

                      <div className="text-[11px] text-neutral-400 font-mono">
                        {playerDetail?.stats?.dimension || 'minecraft:overworld'}
                      </div>
                    </div>

                    {/* Last Death Location */}
                    <div className="bg-[#181d26] rounded-lg p-3 border border-neutral-700/60 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-200">
                        <FontAwesomeIcon icon={faSkull} className="text-rose-400 text-xs" />
                        <span>Last death location</span>
                      </div>
                      <div className="text-xs text-neutral-400 font-mono">
                        {playerDetail?.stats?.last_death_location ? (
                          <>
                            X: {playerDetail.stats.last_death_location.x} / Y:{' '}
                            {playerDetail.stats.last_death_location.y} / Z:{' '}
                            {playerDetail.stats.last_death_location.z}
                            <div className="text-[10px] text-neutral-500 mt-0.5">
                              {playerDetail.stats.last_death_location.dimension}
                            </div>
                          </>
                        ) : (
                          'None recorded'
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. STATISTICS SECTION (4 Columns: PlayTime, Player Kills, Deaths, KDR) */}
              <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col gap-4">
                <div className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                  Statistics
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Column 1: PlayTime & Distances */}
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[#4aa3df] font-bold text-sm">
                        <FontAwesomeIcon icon={faClock} />
                        <span>PlayTime</span>
                      </div>
                      <div className="text-xs text-neutral-300 mt-0.5 font-medium">
                        {playerDetail?.game_statistics?.play_time_formatted || '0 minutes'}
                      </div>
                    </div>

                    <div className="border-t border-neutral-700/60 pt-2 flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-neutral-300">
                        Distance travelled (in blocks)
                      </div>
                      <div className="text-xs text-neutral-400 flex justify-between font-mono">
                        <span>Total</span>
                        <strong className="text-white">{totalDistance.toLocaleString()}</strong>
                      </div>
                      {playerDetail?.game_statistics?.distance_travelled && (
                        <div className="flex flex-col gap-1 text-[11px] text-neutral-400 font-mono mt-1">
                          <div className="flex justify-between">
                            <span>Distance Walked</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.walked.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distance Sprinted</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.sprinted.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distance Crouched</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.crouched.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distance Fallen</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.fallen.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distance Climbed</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.climbed.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distance Walked under Water</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.walked_under_water.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Distance Walked on Water</span>
                            <span className="text-neutral-200">
                              {playerDetail.game_statistics.distance_travelled.walked_on_water.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Player Kills & Blocks Broken */}
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[#4aa3df] font-bold text-sm">
                        <FontAwesomeIcon icon={faShieldAlt} />
                        <span>Player Kills</span>
                      </div>
                      <div className="text-xs text-neutral-300 mt-0.5 font-medium">
                        {playerDetail?.game_statistics?.player_kills ?? 0}
                      </div>
                    </div>

                    <div className="border-t border-neutral-700/60 pt-2 flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-neutral-300">
                        Blocks broken
                      </div>
                      <div className="text-xs text-neutral-400 flex justify-between font-mono">
                        <span>Total</span>
                        <strong className="text-white">{totalBlocksBroken.toLocaleString()}</strong>
                      </div>

                      {/* Blocks broken list */}
                      <div className="flex flex-col gap-1.5 mt-1 max-h-56 overflow-y-auto pr-1">
                        {(playerDetail?.game_statistics?.blocks_broken || [])
                          .slice(0, showAllBlocks ? 50 : 8)
                          .map((b) => (
                            <div
                              key={b.id}
                              className="flex items-center justify-between text-xs text-neutral-300 font-medium"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <img
                                  src={`https://static.minecraftitemids.com/32/${b.clean_id}.png`}
                                  alt=""
                                  className="w-4 h-4 object-contain flex-shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      `https://raw.githubusercontent.com/Owen1212055/minecraft-assets-renders/master/renders/blocks/${b.clean_id}.png`;
                                  }}
                                />
                                <span className="truncate text-[11px]">{b.name}</span>
                              </div>
                              <span className="font-mono text-[11px] text-neutral-400 ml-2">
                                {b.count.toLocaleString()}
                              </span>
                            </div>
                          ))}
                      </div>

                      {(playerDetail?.game_statistics?.blocks_broken?.length || 0) > 8 && (
                        <button
                          onClick={() => setShowAllBlocks(!showAllBlocks)}
                          className="mt-1 self-start px-2 py-0.5 rounded bg-[#27ae60] hover:bg-[#219653] text-white text-[10px] font-bold transition-colors"
                        >
                          {showAllBlocks ? 'Show less' : 'Show all'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Deaths & Items Used */}
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[#4aa3df] font-bold text-sm">
                        <FontAwesomeIcon icon={faSkull} />
                        <span>Deaths</span>
                      </div>
                      <div className="text-xs text-neutral-300 mt-0.5 font-medium">
                        {playerDetail?.game_statistics?.deaths ?? 0}
                      </div>
                    </div>

                    <div className="border-t border-neutral-700/60 pt-2 flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-neutral-300">
                        Items used
                      </div>
                      <div className="text-xs text-neutral-400 flex justify-between font-mono">
                        <span>Total</span>
                        <strong className="text-white">{totalItemsUsed.toLocaleString()}</strong>
                      </div>

                      {/* Items used list */}
                      <div className="flex flex-col gap-1.5 mt-1 max-h-56 overflow-y-auto pr-1">
                        {(playerDetail?.game_statistics?.items_used || [])
                          .slice(0, showAllItems ? 50 : 8)
                          .map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs text-neutral-300 font-medium"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <img
                                  src={`https://static.minecraftitemids.com/32/${item.clean_id}.png`}
                                  alt=""
                                  className="w-4 h-4 object-contain flex-shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      `https://raw.githubusercontent.com/Owen1212055/minecraft-assets-renders/master/renders/items/${item.clean_id}.png`;
                                  }}
                                />
                                <span className="truncate text-[11px]">{item.name}</span>
                              </div>
                              <span className="font-mono text-[11px] text-neutral-400 ml-2">
                                {item.count.toLocaleString()}
                              </span>
                            </div>
                          ))}
                      </div>

                      {(playerDetail?.game_statistics?.items_used?.length || 0) > 8 && (
                        <button
                          onClick={() => setShowAllItems(!showAllItems)}
                          className="mt-1 self-start px-2 py-0.5 rounded bg-[#27ae60] hover:bg-[#219653] text-white text-[10px] font-bold transition-colors"
                        >
                          {showAllItems ? 'Show less' : 'Show all'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Column 4: KDR & Entities Killed */}
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-[#4aa3df] font-bold text-sm">
                        <FontAwesomeIcon icon={faCrosshairs} />
                        <span>KDR</span>
                      </div>
                      <div className="text-xs text-neutral-300 mt-0.5 font-medium">
                        {playerDetail?.game_statistics?.kdr || '0.00'}
                      </div>
                    </div>

                    <div className="border-t border-neutral-700/60 pt-2 flex flex-col gap-1.5">
                      <div className="text-xs font-semibold text-neutral-300">
                        Entities killed
                      </div>
                      <div className="text-xs text-neutral-400 flex justify-between font-mono">
                        <span>Total</span>
                        <strong className="text-white">{totalEntitiesKilled.toLocaleString()}</strong>
                      </div>

                      {/* Entities killed list */}
                      <div className="flex flex-col gap-1.5 mt-1 max-h-56 overflow-y-auto pr-1">
                        {(playerDetail?.game_statistics?.entities_killed || []).map((e) => (
                          <div
                            key={e.id}
                            className="flex items-center justify-between text-xs text-neutral-300 font-medium"
                          >
                            <span className="truncate text-[11px]">{e.name}</span>
                            <span className="font-mono text-[11px] text-neutral-400 ml-2">
                              {e.count.toLocaleString()}
                            </span>
                          </div>
                        ))}
                        {(!playerDetail?.game_statistics?.entities_killed ||
                          playerDetail.game_statistics.entities_killed.length === 0) && (
                          <div className="text-[11px] text-neutral-500 italic">None recorded</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. DELETE PLAYER DATA SECTION */}
              <div className="bg-[#242b37] border border-neutral-700/60 rounded-xl p-4 flex flex-col gap-3">
                <div className="text-xs font-bold text-neutral-300">
                  Delete player data
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Checkboxes */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-300 select-none">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteTargets.experience}
                        onChange={(e) =>
                          setDeleteTargets((cur) => ({ ...cur, experience: e.target.checked }))
                        }
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Experience points</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteTargets.inventory}
                        onChange={(e) =>
                          setDeleteTargets((cur) => ({ ...cur, inventory: e.target.checked }))
                        }
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Inventory</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteTargets.ender_chest}
                        onChange={(e) =>
                          setDeleteTargets((cur) => ({ ...cur, ender_chest: e.target.checked }))
                        }
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Ender Chest</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteTargets.playerdata}
                        onChange={(e) =>
                          setDeleteTargets((cur) => ({ ...cur, playerdata: e.target.checked }))
                        }
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Player data file</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteTargets.stats}
                        onChange={(e) =>
                          setDeleteTargets((cur) => ({ ...cur, stats: e.target.checked }))
                        }
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Statistics file</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deleteTargets.advancements}
                        onChange={(e) =>
                          setDeleteTargets((cur) => ({ ...cur, advancements: e.target.checked }))
                        }
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Advancements file</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-200">
                      <input
                        type="checkbox"
                        checked={allDeleteSelected}
                        onChange={toggleSelectAllDelete}
                        className="rounded bg-[#181d26] border-neutral-600 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                      />
                      <span>Select all</span>
                    </label>
                  </div>

                  {/* Red Action Button */}
                  <button
                    onClick={() => {
                      if (!hasAnyDeleteTarget) {
                        showToast('error', 'Please select at least one data component to delete.');
                        return;
                      }
                      setDeleteConfirmOpen(true);
                    }}
                    disabled={actionLoading !== null || !hasAnyDeleteTarget}
                    className="px-4 py-2 rounded-lg bg-[#eb6f5e] hover:bg-[#de5d4b] text-white text-xs font-bold transition-all shadow disabled:opacity-40 active:scale-95 whitespace-nowrap self-start sm:self-auto"
                  >
                    Delete player data
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-MODALS                                                                */}
      {/* ========================================================================= */}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-rose-700/60 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faTrashAlt} className="text-rose-400" />
              <span>Confirm Player Data Deletion</span>
            </h3>
            <p className="text-xs text-neutral-300 mb-4 leading-relaxed">
              Are you sure you want to permanently delete selected data for{' '}
              <strong className="text-white">{selectedPlayer.name}</strong>? This action cannot be
              undone.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  const selectedKeys = Object.entries(deleteTargets)
                    .filter(([_, val]) => val)
                    .map(([k]) => k);
                  executePlayerAction('delete_player_data', { targets: selectedKeys });
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teleport Modal */}
      {teleportModalOpen && selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faLocationArrow} className="text-primary-400" />
              <span>Teleport {selectedPlayer.name}</span>
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Teleport this player to custom coordinates or to another online player.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">X Coord</label>
                <input
                  type="text"
                  value={teleportCoords.x}
                  onChange={(e) => setTeleportCoords({ ...teleportCoords, x: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Y Coord</label>
                <input
                  type="text"
                  value={teleportCoords.y}
                  onChange={(e) => setTeleportCoords({ ...teleportCoords, y: e.target.value })}
                  placeholder="64"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-neutral-400 block mb-1">Z Coord</label>
                <input
                  type="text"
                  value={teleportCoords.z}
                  onChange={(e) => setTeleportCoords({ ...teleportCoords, z: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>

            <div className="mb-5">
              <label className="text-[11px] font-semibold text-neutral-400 block mb-1">
                Or Destination Player
              </label>
              <input
                type="text"
                value={teleportCoords.target}
                onChange={(e) => setTeleportCoords({ ...teleportCoords, target: e.target.value })}
                placeholder="Target Player Username"
                className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setTeleportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setTeleportModalOpen(false);
                  executePlayerAction('teleport', {
                    x: teleportCoords.x || undefined,
                    y: teleportCoords.y || undefined,
                    z: teleportCoords.z || undefined,
                    target: teleportCoords.target || undefined,
                  });
                }}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold shadow-lg"
              >
                Teleport
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Modal */}
      {kickModalOpen && selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faSignOutAlt} className="text-amber-400" />
              <span>Kick {selectedPlayer.name}</span>
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Disconnect this player immediately from the server.
            </p>

            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Kick Reason</label>
            <input
              type="text"
              value={kickReason}
              onChange={(e) => setKickReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm focus:outline-none focus:border-amber-500 mb-5"
            />

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setKickModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setKickModalOpen(false);
                  executePlayerAction('kick', { reason: kickReason });
                }}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg"
              >
                Confirm Kick
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {banModalOpen && selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-700 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faGavel} className="text-rose-400" />
              <span>Ban {selectedPlayer.name}</span>
            </h3>
            <p className="text-xs text-neutral-400 mb-4">
              Add this player to banned-players.json and prevent reconnection.
            </p>

            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Ban Reason</label>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 text-sm focus:outline-none focus:border-rose-500 mb-3"
            />

            <label className="flex items-center gap-2.5 cursor-pointer text-xs text-neutral-300 mb-5 select-none">
              <input
                type="checkbox"
                checked={banIpChecked}
                onChange={(e) => setBanIpChecked(e.target.checked)}
                className="rounded bg-neutral-950 border-neutral-700 text-rose-500 focus:ring-0 w-4 h-4"
              />
              <span>Also Ban IP Address (/ban-ip)</span>
            </label>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setBanModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setBanModalOpen(false);
                  executePlayerAction('ban', { reason: banReason, ban_ip: banIpChecked });
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg"
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}
    </ServerContentBlock>
  );
}

/**
 * Individual Inventory Slot Component with 3D Item Rendering and Hover Tooltip
 */
function InventorySlot({
  item,
  isHotbar = false,
  placeholder,
}: {
  item?: InventoryItem;
  isHotbar?: boolean;
  placeholder?: 'helmet' | 'chestplate' | 'leggings' | 'boots' | 'shield';
}) {
  const [hovered, setHovered] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  // Reset fallback index whenever the item changes so new items don't inherit old fallbacks
  useEffect(() => {
    setFallbackIndex(0);
  }, [item?.clean_id]);

  // Available fallback texture sources (Primary: static.minecraftitemids.com 64px official Minecraft inventory sprites)
  const textureSources = useMemo(() => {
    if (!item) return [];
    const id = item.clean_id;
    return [
      `https://static.minecraftitemids.com/64/${id}.png`,
      `https://static.minecraftitemids.com/32/${id}.png`,
      `https://raw.githubusercontent.com/Owen1212055/minecraft-assets-renders/master/renders/items/${id}.png`,
      `https://raw.githubusercontent.com/Owen1212055/minecraft-assets-renders/master/renders/blocks/${id}.png`,
      `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/item/${id}.png`,
      `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/block/${id}.png`,
    ];
  }, [item?.clean_id]);

  const currentImgSrc = textureSources[fallbackIndex] || '';

  const handleImgError = () => {
    if (fallbackIndex < textureSources.length - 1) {
      setFallbackIndex((prev) => prev + 1);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative w-9 h-9 sm:w-10 sm:h-10 bg-[#8b8b8b] border-2 border-t-[#373737] border-l-[#373737] border-b-[#ffffff] border-r-[#ffffff] flex items-center justify-center select-none"
    >
      {item ? (
        <>
          <img
            src={currentImgSrc}
            alt=""
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain pointer-events-none drop-shadow"
            style={{ imageRendering: 'pixelated' }}
            onError={handleImgError}
          />

          {/* Minecraft Item Count in Bottom-Right Corner */}
          {item.count > 1 && (
            <span
              className="absolute bottom-0.5 right-1 font-mono font-bold text-[11px] text-white select-none pointer-events-none drop-shadow-[0_1.5px_1px_rgba(0,0,0,1)]"
              style={{
                textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
              }}
            >
              {item.count}
            </span>
          )}

          {/* Rich Minecraft Item Tooltip */}
          {hovered && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-52 bg-[#120524]/95 border-2 border-[#380e68] rounded-md p-2.5 shadow-2xl backdrop-blur-md text-left">
              <div
                className={`text-xs font-bold mb-0.5 ${
                  item.enchantments && item.enchantments.length > 0
                    ? 'text-cyan-300'
                    : 'text-white'
                }`}
              >
                {item.name}
              </div>
              <div className="text-[10px] font-mono text-neutral-400 mb-1">{item.id}</div>

              {item.enchantments && item.enchantments.length > 0 && (
                <div className="border-t border-[#380e68] pt-1 mt-1 flex flex-col gap-0.5">
                  {item.enchantments.map((ench, idx) => (
                    <div key={idx} className="text-[11px] text-[#aa00aa] font-semibold">
                      {formatEnchantmentName(ench.id)} {toRoman(ench.lvl)}
                    </div>
                  ))}
                </div>
              )}

              {item.lore && item.lore.length > 0 && (
                <div className="border-t border-[#380e68] pt-1 mt-1 text-[10px] text-purple-200/80 italic flex flex-col gap-0.5">
                  {item.lore.map((l, lIdx) => (
                    <div key={lIdx}>{l}</div>
                  ))}
                </div>
              )}

              {item.damage !== undefined && item.damage > 0 && (
                <div className="text-[10px] text-amber-400 mt-1">Durability: -{item.damage}</div>
              )}
            </div>
          )}
        </>
      ) : placeholder ? (
        /* Silhouette Slot Placeholder */
        <div className="opacity-30 pointer-events-none flex items-center justify-center">
          {placeholder === 'helmet' && (
            <svg className="w-5 h-5 fill-neutral-700" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12v5h4v-3h12v3h4v-5c0-5.52-4.48-10-10-10zm-3 8H6V8h3v2zm9 0h-3V8h3v2z" />
            </svg>
          )}
          {placeholder === 'chestplate' && (
            <svg className="w-5 h-5 fill-neutral-700" viewBox="0 0 24 24">
              <path d="M6 3l3 3h6l3-3 4 4-2 3v11H4V10L2 7l4-4z" />
            </svg>
          )}
          {placeholder === 'leggings' && (
            <svg className="w-5 h-5 fill-neutral-700" viewBox="0 0 24 24">
              <path d="M6 2h12v6h-3v14h-6V8H6V2z" />
            </svg>
          )}
          {placeholder === 'boots' && (
            <svg className="w-5 h-5 fill-neutral-700" viewBox="0 0 24 24">
              <path d="M4 4h5v11h2V4h5v11h2v5H11v-3H9v3H4V4z" />
            </svg>
          )}
          {placeholder === 'shield' && (
            <svg className="w-5 h-5 fill-neutral-700" viewBox="0 0 24 24">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Pixel-accurate SVG Minecraft Heart
 */
function MinecraftHeart({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  if (fill === 'full') {
    return (
      <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1h2v1H1zM6 1h2v1H6zM0 2h1v3H0zM3 2h3v1H3zM8 2h1v3H8zM1 5h1v1H1zM7 5h1v1H7zM2 6h1v1H2zM6 6h1v1H6zM3 7h1v1H3zM5 7h1v1H5zM4 8h1v1H4z" fill="#000" />
        <path d="M1 2h2v3H1zM6 2h2v3H6zM3 3h3v3H3zM2 5h5v1H2zM3 6h3v1H3zM4 7h1v1H4z" fill="#E11D48" />
        <path d="M1 2h1v1H1zM2 3h1v1H2z" fill="#FFF" />
      </svg>
    );
  }
  if (fill === 'half') {
    return (
      <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 1h2v1H1zM6 1h2v1H6zM0 2h1v3H0zM3 2h3v1H3zM8 2h1v3H8zM1 5h1v1H1zM7 5h1v1H7zM2 6h1v1H2zM6 6h1v1H6zM3 7h1v1H3zM5 7h1v1H5zM4 8h1v1H4z" fill="#000" />
        <path d="M1 2h2v3H1zM3 3h1v3H3zM2 5h2v1H2zM3 6h1v1H3zM4 7h1v1H4z" fill="#E11D48" />
        <path d="M1 2h1v1H1zM2 3h1v1H2z" fill="#FFF" />
        <path d="M6 2h2v3H6zM4 3h2v3H4zM4 5h3v1H4zM4 6h2v1H4z" fill="#374151" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow opacity-50" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1h2v1H1zM6 1h2v1H6zM0 2h1v3H0zM3 2h3v1H3zM8 2h1v3H8zM1 5h1v1H1zM7 5h1v1H7zM2 6h1v1H2zM6 6h1v1H6zM3 7h1v1H3zM5 7h1v1H5zM4 8h1v1H4z" fill="#000" />
      <path d="M1 2h2v3H1zM6 2h2v3H6zM3 3h3v3H3zM2 5h5v1H2zM3 6h3v1H3zM4 7h1v1H4z" fill="#374151" />
    </svg>
  );
}

/**
 * Pixel-accurate SVG Minecraft Drumstick
 */
function MinecraftDrumstick({ fill }: { fill: 'full' | 'half' | 'empty' }) {
  if (fill === 'full') {
    return (
      <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 0h3v1H4zM2 1h5v1H2zM1 2h6v2H1zM2 4h5v1H2zM3 5h3v1H3zM0 6h2v1H0zM1 7h2v1H1zM0 8h2v1H0z" fill="#78350F" />
        <path d="M4 1h2v1H4zM3 2h4v1H3zM3 3h3v1H3z" fill="#F59E0B" />
        <path d="M0 6h1v1H0zM1 7h1v1H1zM0 8h1v1H0z" fill="#E5E7EB" />
      </svg>
    );
  }
  if (fill === 'half') {
    return (
      <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 0h3v1H4zM2 1h5v1H2zM1 2h6v2H1zM2 4h5v1H2zM3 5h3v1H3zM0 6h2v1H0zM1 7h2v1H1zM0 8h2v1H0z" fill="#374151" />
        <path d="M4 1h1v1H4zM3 2h2v1H3zM3 3h2v1H3zM3 4h1v1H3z" fill="#78350F" />
        <path d="M0 6h1v1H0zM1 7h1v1H1zM0 8h1v1H0z" fill="#E5E7EB" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow opacity-50" viewBox="0 0 9 9" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 0h3v1H4zM2 1h5v1H2zM1 2h6v2H1zM2 4h5v1H2zM3 5h3v1H3zM0 6h2v1H0zM1 7h2v1H1zM0 8h2v1H0z" fill="#374151" />
      <path d="M0 6h1v1H0zM1 7h1v1H1zM0 8h1v1H0z" fill="#9CA3AF" />
    </svg>
  );
}

function formatEnchantmentName(raw: string): string {
  return raw
    .replace('minecraft:', '')
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

function toRoman(num: number): string {
  const map: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
  return map[num] || num.toString();
}
