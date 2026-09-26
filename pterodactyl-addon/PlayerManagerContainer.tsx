import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUsers,
  faUserCheck,
  faUserSlash,
  faUserFriends,
  faCircle,
  faShieldAlt,
  faCrown,
  faSignOutAlt,
  faGavel,
  faHeartbeat,
  faUtensils,
  faEraser,
  faSyncAlt,
  faSearch,
  faTimes,
  faCheckCircle,
  faExclamationTriangle,
  faCube,
  faSlidersH,
  faCommentDots,
  faSkull,
  faCopy,
  faCheck,
  faUnlockAlt,
  faEye,
  faPlay,
  faPause,
  faTh,
  faBoxArchive,
  faInfoCircle,
  faGlobeAmericas,
  faMapMarkerAlt,
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

interface PlayerDetailResponse {
  success: boolean;
  name: string;
  uuid: string;
  is_op: boolean;
  is_banned: boolean;
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
    last_modified?: string | null;
  };
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
  { label: 'Survival', value: 'survival' },
  { label: 'Creative', value: 'creative' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Spectator', value: 'spectator' },
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Sub-modals for Kick / Ban / Message
  const [kickModalOpen, setKickModalOpen] = useState(false);
  const [kickReason, setKickReason] = useState('Kicked by server administrator.');
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [banReason, setBanReason] = useState('Banned by server administrator.');
  const [banIpChecked, setBanIpChecked] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [whisperMessage, setWhisperMessage] = useState('');
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Inventory tab: 'inventory' or 'ender_chest'
  const [inventoryView, setInventoryView] = useState<'inventory' | 'ender_chest'>('inventory');

  // 3D Model viewer references & state
  const skinCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const skinViewerInstanceRef = useRef<any>(null);
  const [autoRotate3D, setAutoRotate3D] = useState(true);
  const [currentAnimation, setCurrentAnimation] = useState<'walk' | 'run' | 'idle'>('walk');
  const [skinviewLoaded, setSkinviewLoaded] = useState(false);

  // Show Toast notification helper
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  };

  // Load skinview3d script dynamically on mount
  useEffect(() => {
    if ((window as any).skinview3d) {
      setSkinviewLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/skinview3d@3.1.0/bundles/skinview3d.bundle.js';
    script.async = true;
    script.onload = () => {
      setSkinviewLoaded(true);
    };
    document.head.appendChild(script);
  }, []);

  // Fetch all players data from backend
  const loadPlayers = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      try {
        const res = await http.get<PlayersApiResponse>(`/api/client/servers/${uuid}/players`);
        if (res.data.success) {
          if (res.data.software) setSoftware(res.data.software);
          setServerOnline(res.data.server_online);
          setOnlineCount(res.data.online_count);
          setMaxPlayers(res.data.max_players || 20);
          setOnlineMode(res.data.online_mode);
          setOnlinePlayers(res.data.online_players || []);
          setBannedPlayers(res.data.banned_players || []);
          setAllPlayers(res.data.all_players || []);
        }
      } catch (err) {
        console.error(err);
        showToast('error', httpErrorToHuman(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uuid]
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

  useEffect(() => {
    loadPlayers();
    // Auto-refresh stats every 5 seconds seamlessly
    const interval = setInterval(() => {
      loadPlayers();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadPlayers]);

  // Load single player details and inventory
  const loadPlayerDetails = useCallback(
    async (player: PlayerSummary, forceLoadingState = false) => {
      // If player already has pre-fetched data, don't flash spinner
      if (forceLoadingState || !player.inventory) {
        setLoadingDetail(true);
      }
      try {
        const res = await http.get<PlayerDetailResponse>(`/api/client/servers/${uuid}/players/detail`, {
          params: {
            player: player.name,
            uuid: player.uuid,
          },
        });
        if (res.data.success) {
          setPlayerDetail(res.data);
        }
      } catch (err) {
        console.error(err);
        showToast('error', `Failed to load details for ${player.name}: ${httpErrorToHuman(err)}`);
      } finally {
        setLoadingDetail(false);
      }
    },
    [uuid]
  );

  // Open modal for player (Instant 0ms opening like Aternos!)
  const handleSelectPlayer = (player: PlayerSummary) => {
    setSelectedPlayer(player);
    if (player.inventory !== undefined && player.stats !== undefined) {
      setPlayerDetail({
        success: true,
        name: player.name,
        uuid: player.uuid,
        is_op: player.is_op,
        is_banned: player.is_banned,
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
    loadPlayerDetails(player);
  };

  // Close modal
  const handleCloseModal = () => {
    setSelectedPlayer(null);
    setPlayerDetail(null);
    if (skinViewerInstanceRef.current) {
      try {
        skinViewerInstanceRef.current.dispose();
      } catch (e) {}
      skinViewerInstanceRef.current = null;
    }
  };

  // Initialize or update skinview3d on modal open
  useEffect(() => {
    if (!selectedPlayer || !skinCanvasRef.current || !(window as any).skinview3d) {
      return;
    }

    try {
      if (skinViewerInstanceRef.current) {
        skinViewerInstanceRef.current.dispose();
        skinViewerInstanceRef.current = null;
      }

      const skinUrl =
        playerDetail?.skin_url ||
        selectedPlayer.skin_url ||
        'https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/entity/player/wide/steve.png';

      const viewer = new (window as any).skinview3d.SkinViewer({
        canvas: skinCanvasRef.current,
        width: 220,
        height: 280,
        skin: skinUrl,
      });

      viewer.fov = 70;
      viewer.zoom = 0.9;
      viewer.autoRotate = autoRotate3D;
      viewer.autoRotateSpeed = 1.0;

      if (currentAnimation === 'walk') {
        viewer.animation = new (window as any).skinview3d.WalkingAnimation();
        viewer.animation.speed = 0.65;
      } else if (currentAnimation === 'run') {
        viewer.animation = new (window as any).skinview3d.RunningAnimation();
        viewer.animation.speed = 0.85;
      } else {
        viewer.animation = null;
      }

      skinViewerInstanceRef.current = viewer;
    } catch (e) {
      console.error('Skin viewer error:', e);
    }

    return () => {
      if (skinViewerInstanceRef.current) {
        try {
          skinViewerInstanceRef.current.dispose();
        } catch (e) {}
        skinViewerInstanceRef.current = null;
      }
    };
  }, [selectedPlayer, playerDetail?.skin_url, skinviewLoaded]);

  // Update auto-rotate in 3D viewer
  const toggleAutoRotate = () => {
    const next = !autoRotate3D;
    setAutoRotate3D(next);
    if (skinViewerInstanceRef.current) {
      skinViewerInstanceRef.current.autoRotate = next;
    }
  };

  // Switch 3D animation
  const switchAnimation = (anim: 'walk' | 'run' | 'idle') => {
    setCurrentAnimation(anim);
    if (!skinViewerInstanceRef.current || !(window as any).skinview3d) return;

    if (anim === 'walk') {
      skinViewerInstanceRef.current.animation = new (window as any).skinview3d.WalkingAnimation();
      skinViewerInstanceRef.current.animation.speed = 0.65;
    } else if (anim === 'run') {
      skinViewerInstanceRef.current.animation = new (window as any).skinview3d.RunningAnimation();
      skinViewerInstanceRef.current.animation.speed = 0.85;
    } else {
      skinViewerInstanceRef.current.animation = null;
    }
  };

  // Perform Player Action (OP, kick, ban, heal, feed, clear, unban, etc.)
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
        // Reload details & lists
        loadPlayers();
        if (action === 'ban' || action === 'kick') {
          handleCloseModal();
        } else if (action === 'unban') {
          handleCloseModal();
        } else {
          loadPlayerDetails(selectedPlayer);
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

  // Combined players map (ensuring online players are always present and flagged is_online)
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
    // Sort: Online players first, then alphabetically
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

  // Filter players by active tab, sub-filter, and search query
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

  // Helper to format item texture URL with fallback
  const getItemIconUrl = (cleanId: string) => {
    return `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/item/${cleanId}.png`;
  };

  return (
    <ServerContentBlock
      title="Player Manager"
      description="Live player monitoring, real-time 3D skin models, inventory inspector, operator controls, and ban manager."
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
                  <FontAwesomeIcon icon={faSyncAlt} className="text-[9px] animate-spin" style={{ animationDuration: '4s' }} />
                  <span>Live 5s</span>
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

          {/* Search and Refresh Action */}
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
                placeholder="Search players by name..."
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

        {/* Capacity Progress Bar */}
        <div className="mt-4 pt-4 border-t border-neutral-800/80 flex items-center gap-3">
          <div className="flex-1 bg-neutral-950 h-2 rounded-full overflow-hidden border border-neutral-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                onlineCount / (maxPlayers || 1) > 0.85
                  ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                  : 'bg-gradient-to-r from-primary-500 to-emerald-400'
              }`}
              style={{
                width: `${Math.min(100, Math.round((onlineCount / (maxPlayers || 1)) * 100))}%`,
              }}
            />
          </div>
          <span className="text-xs text-neutral-400 font-mono">
            {Math.round((onlineCount / (maxPlayers || 1)) * 100)}% Capacity
          </span>
        </div>
      </div>

      {/* Notice banner if server reports online players but list is syncing */}
      {serverOnline && onlineCount > 0 && onlinePlayersCount === 0 && (
        <div className="bg-primary-950/40 border border-primary-800/50 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-primary-200 shadow-md">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={faInfoCircle} className="text-primary-400 text-lg flex-shrink-0" />
            <span>
              Server reports <strong>{onlineCount}</strong> player(s) online. If names haven't refreshed yet, click <strong>Sync Online</strong>.
            </span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
          >
            <FontAwesomeIcon icon={faSyncAlt} className={syncing ? 'animate-spin' : ''} />
            <span>Sync Now</span>
          </button>
        </div>
      )}

      {/* Primary Tabs: Players | Banned Players */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 mb-6 pb-3">
        <div className="flex items-center gap-2">
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

        {/* Sub-filters for Players Tab: All | Online | Offline */}
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
          <p className="text-sm">Querying server for player records & skins...</p>
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
              ? 'None of the server players are currently connected. Join your Minecraft server address to appear online.'
              : 'No players have joined this Minecraft server yet. Connect to the server to generate player data and inventories.'}
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
                {/* 64x64 Player Head Avatar */}
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

                {/* Player Name and Badges */}
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

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {player.is_banned ? (
                      <span className="px-2 py-0.5 rounded-md bg-rose-950/70 text-rose-400 border border-rose-800/50 font-medium">
                        Banned
                      </span>
                    ) : player.is_online ? (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-950/70 text-emerald-400 border border-emerald-800/50 font-medium">
                        Online
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-neutral-800 text-neutral-400 border border-neutral-700 font-medium">
                        Offline
                      </span>
                    )}

                    {(player.name.startsWith('.') || player.name.startsWith('*') || player.name.includes(' ') || software?.category === 'bedrock') ? (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-emerald-950/50 text-emerald-300 border border-emerald-800/40 text-[10px]"
                        title="Bedrock edition player"
                      >
                        Bedrock
                      </span>
                    ) : player.skin_type === 'steve' ? (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-amber-950/50 text-amber-300 border border-amber-800/40 text-[10px]"
                        title="Cracked account default Steve"
                      >
                        Steve
                      </span>
                    ) : player.skin_type === 'premium' ? (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-cyan-950/50 text-cyan-300 border border-cyan-800/40 text-[10px]"
                        title="Official Mojang premium skin"
                      >
                        Premium
                      </span>
                    ) : (
                      <span
                        className="px-1.5 py-0.5 rounded-md bg-indigo-950/50 text-indigo-300 border border-indigo-800/40 text-[10px]"
                        title="Player skin"
                      >
                        Skin
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ban Reason Preview if Banned */}
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
      {/* PLAYER MANAGEMENT MODAL / GUI                                              */}
      {/* ========================================================================= */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-950/70">
              <div className="flex items-center gap-3">
                <img
                  src={selectedPlayer.avatar_url}
                  alt={selectedPlayer.name}
                  className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 object-cover"
                  style={{ imageRendering: 'pixelated' }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-extrabold text-white tracking-tight">
                      {selectedPlayer.name}
                    </h2>
                    {selectedPlayer.is_op && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-600/50 font-bold flex items-center gap-1">
                        <FontAwesomeIcon icon={faShieldAlt} /> OP
                      </span>
                    )}
                    {selectedPlayer.is_banned ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-600/50 font-semibold">
                        Banned
                      </span>
                    ) : selectedPlayer.is_online ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-600/50 font-semibold flex items-center gap-1">
                        <FontAwesomeIcon icon={faCircle} className="text-[7px] text-emerald-400 animate-pulse" />
                        Online
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700 font-semibold">
                        Offline
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
                    <span>{selectedPlayer.uuid}</span>
                    <button
                      onClick={() => handleCopyUuid(selectedPlayer.uuid)}
                      title="Copy UUID"
                      className="text-neutral-500 hover:text-white transition-colors"
                    >
                      <FontAwesomeIcon icon={copiedUuid ? faCheck : faCopy} />
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCloseModal}
                className="w-9 h-9 rounded-xl bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>

            {/* Banned Alert Banner */}
            {selectedPlayer.is_banned && (
              <div className="bg-rose-950/60 border-b border-rose-800/40 px-6 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-sm text-rose-200">
                  <FontAwesomeIcon icon={faUserSlash} className="text-rose-400 text-lg" />
                  <div>
                    <span className="font-bold text-white">Player is Banned:</span>{' '}
                    <span className="italic">
                      "{playerDetail?.ban_info?.reason || selectedPlayer.reason || 'Banned by operator'}"
                    </span>
                    <div className="text-xs text-rose-300/70 mt-0.5">
                      Banned by: {playerDetail?.ban_info?.source || selectedPlayer.source || 'Server'} |
                      Date: {playerDetail?.ban_info?.created || selectedPlayer.created || 'N/A'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => executePlayerAction('unban')}
                  disabled={actionLoading === 'unban'}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg flex items-center gap-2 active:scale-95"
                >
                  <FontAwesomeIcon icon={faUnlockAlt} />
                  <span>Unban Player</span>
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* LEFT COLUMN: 3D MODEL & QUICK CONTROLS (5 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-4">
                {/* 3D Model Box */}
                <div className="bg-neutral-950 rounded-2xl border border-neutral-800 p-4 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
                  <div className="absolute top-3 left-3 z-10">
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${
                        selectedPlayer.skin_type === 'steve'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-700/50'
                          : selectedPlayer.skin_type === 'premium'
                          ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700/50'
                          : 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50'
                      }`}
                    >
                      {selectedPlayer.skin_type === 'steve'
                        ? 'Cracked (Steve Skin)'
                        : selectedPlayer.skin_type === 'premium'
                        ? 'Official Premium Skin'
                        : 'Player Skin'}
                    </span>
                  </div>

                  {/* 3D WebGL Canvas */}
                  <div className="relative w-full h-[280px] flex items-center justify-center">
                    <canvas
                      ref={skinCanvasRef}
                      className="cursor-grab active:cursor-grabbing max-w-full"
                    />
                    {!skinviewLoaded && (
                      <img
                        src={selectedPlayer.render_3d_url}
                        alt="3D render"
                        className="max-h-[250px] object-contain drop-shadow-2xl"
                      />
                    )}
                  </div>

                  {/* 3D View Controls */}
                  <div className="w-full flex items-center justify-between pt-3 mt-1 border-t border-neutral-800/80 text-xs text-neutral-400">
                    <button
                      onClick={toggleAutoRotate}
                      className={`px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1.5 ${
                        autoRotate3D
                          ? 'bg-neutral-800 text-primary-400 border-primary-500/40'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                      }`}
                      title="Toggle auto rotation"
                    >
                      <FontAwesomeIcon icon={faSyncAlt} className={autoRotate3D ? 'animate-spin' : ''} />
                      <span>Rotate</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => switchAnimation('walk')}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          currentAnimation === 'walk'
                            ? 'bg-neutral-800 text-white font-semibold'
                            : 'hover:bg-neutral-800/50 text-neutral-400'
                        }`}
                      >
                        Walk
                      </button>
                      <button
                        onClick={() => switchAnimation('run')}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          currentAnimation === 'run'
                            ? 'bg-neutral-800 text-white font-semibold'
                            : 'hover:bg-neutral-800/50 text-neutral-400'
                        }`}
                      >
                        Run
                      </button>
                      <button
                        onClick={() => switchAnimation('idle')}
                        className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          currentAnimation === 'idle'
                            ? 'bg-neutral-800 text-white font-semibold'
                            : 'hover:bg-neutral-800/50 text-neutral-400'
                        }`}
                      >
                        Idle
                      </button>
                    </div>
                  </div>
                </div>

                {/* Management Action Buttons Grid */}
                <div className="bg-neutral-950/70 rounded-2xl border border-neutral-800 p-4">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">
                    Player Actions
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {/* OP / DEOP */}
                    <button
                      onClick={() => executePlayerAction(selectedPlayer.is_op ? 'deop' : 'op')}
                      disabled={actionLoading !== null}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                        selectedPlayer.is_op
                          ? 'bg-amber-950/60 border-amber-600/50 text-amber-300 hover:bg-amber-900/60'
                          : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                      }`}
                    >
                      <FontAwesomeIcon icon={faShieldAlt} />
                      <span>{selectedPlayer.is_op ? 'Revoke OP' : 'Give OP'}</span>
                    </button>

                    {/* HEAL */}
                    <button
                      onClick={() => executePlayerAction('heal')}
                      disabled={actionLoading !== null}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-emerald-950/80 border border-neutral-700 hover:border-emerald-600/60 text-emerald-300 transition-all active:scale-95"
                    >
                      <FontAwesomeIcon icon={faHeartbeat} />
                      <span>Heal</span>
                    </button>

                    {/* FEED */}
                    <button
                      onClick={() => executePlayerAction('feed')}
                      disabled={actionLoading !== null}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-amber-950/80 border border-neutral-700 hover:border-amber-600/60 text-amber-300 transition-all active:scale-95"
                    >
                      <FontAwesomeIcon icon={faUtensils} />
                      <span>Feed</span>
                    </button>

                    {/* CLEAR INVENTORY */}
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Are you sure you want to clear ${selectedPlayer.name}'s inventory?`
                          )
                        ) {
                          executePlayerAction('clear');
                        }
                      }}
                      disabled={actionLoading !== null}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-rose-950/80 border border-neutral-700 hover:border-rose-600/60 text-rose-300 transition-all active:scale-95"
                    >
                      <FontAwesomeIcon icon={faEraser} />
                      <span>Clear Inv</span>
                    </button>

                    {/* KICK */}
                    <button
                      onClick={() => setKickModalOpen(true)}
                      disabled={actionLoading !== null || !selectedPlayer.is_online}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-amber-950/80 border border-neutral-700 hover:border-amber-600/60 text-amber-400 transition-all disabled:opacity-40 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} />
                      <span>Kick</span>
                    </button>

                    {/* BAN / UNBAN */}
                    {selectedPlayer.is_banned ? (
                      <button
                        onClick={() => executePlayerAction('unban')}
                        disabled={actionLoading !== null}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all active:scale-95"
                      >
                        <FontAwesomeIcon icon={faUnlockAlt} />
                        <span>Unban</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setBanModalOpen(true)}
                        disabled={actionLoading !== null}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-neutral-800 hover:bg-rose-950/80 border border-neutral-700 hover:border-rose-600/60 text-rose-400 transition-all active:scale-95"
                      >
                        <FontAwesomeIcon icon={faGavel} />
                        <span>Ban</span>
                      </button>
                    )}
                  </div>

                  {/* Gamemode Selector */}
                  <div className="mt-3 pt-3 border-t border-neutral-800">
                    <label className="text-[11px] font-semibold text-neutral-400 block mb-1.5 flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faSlidersH} />
                      <span>Switch Gamemode</span>
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {GAMEMODES.map((gm) => (
                        <button
                          key={gm.value}
                          onClick={() => executePlayerAction('gamemode', { gamemode: gm.value })}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] text-neutral-300 font-medium text-left transition-colors flex items-center justify-between"
                        >
                          <span>{gm.label}</span>
                          {playerDetail?.stats.game_mode ===
                            (gm.value === 'survival'
                              ? 0
                              : gm.value === 'creative'
                              ? 1
                              : gm.value === 'adventure'
                              ? 2
                              : 3) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: INVENTORY & IN-GAME ATTRIBUTES (8 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                {/* Player In-Game Stats Strip */}
                <div className="bg-neutral-950/80 rounded-2xl border border-neutral-800 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Health */}
                    <div className="bg-neutral-900/90 rounded-xl p-3 border border-neutral-800/80 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-rose-950/60 border border-rose-800/40 flex items-center justify-center text-rose-400">
                        <FontAwesomeIcon icon={faHeartbeat} />
                      </div>
                      <div>
                        <div className="text-[11px] text-neutral-400 font-medium">Health</div>
                        <div className="text-sm font-bold text-white">
                          {playerDetail ? `${playerDetail.stats.health} / 20` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Food / Hunger */}
                    <div className="bg-neutral-900/90 rounded-xl p-3 border border-neutral-800/80 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-950/60 border border-amber-800/40 flex items-center justify-center text-amber-400">
                        <FontAwesomeIcon icon={faUtensils} />
                      </div>
                      <div>
                        <div className="text-[11px] text-neutral-400 font-medium">Hunger</div>
                        <div className="text-sm font-bold text-white">
                          {playerDetail ? `${playerDetail.stats.food_level} / 20` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Level */}
                    <div className="bg-neutral-900/90 rounded-xl p-3 border border-neutral-800/80 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 font-mono font-black">
                        L
                      </div>
                      <div>
                        <div className="text-[11px] text-neutral-400 font-medium">Experience</div>
                        <div className="text-sm font-bold text-emerald-400">
                          {playerDetail ? `Level ${playerDetail.stats.level}` : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Dimension */}
                    <div className="bg-neutral-900/90 rounded-xl p-3 border border-neutral-800/80 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-950/60 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
                        <FontAwesomeIcon icon={faGlobeAmericas} />
                      </div>
                      <div>
                        <div className="text-[11px] text-neutral-400 font-medium">Dimension</div>
                        <div className="text-sm font-bold text-white capitalize truncate">
                          {playerDetail
                            ? playerDetail.stats.dimension.replace('minecraft:', '').replace('_', ' ')
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Coordinates if available */}
                  {playerDetail?.stats.pos && (
                    <div className="mt-3 pt-3 border-t border-neutral-800/70 flex items-center justify-between text-xs text-neutral-400">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faMapMarkerAlt} className="text-neutral-500" />
                        <span>
                          X: <strong className="text-neutral-200">{playerDetail.stats.pos[0]}</strong>, Y:{' '}
                          <strong className="text-neutral-200">{playerDetail.stats.pos[1]}</strong>, Z:{' '}
                          <strong className="text-neutral-200">{playerDetail.stats.pos[2]}</strong>
                        </span>
                      </div>
                      {selectedPlayer.is_banned && (
                        <span className="text-rose-400 font-medium">
                          Last known data saved prior to ban
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* IN-GAME INVENTORY GUI */}
                <div className="bg-neutral-950/90 rounded-2xl border border-neutral-800 p-5 shadow-2xl flex-1 flex flex-col">
                  {/* Inventory Header & Tab Switcher */}
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setInventoryView('inventory')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          inventoryView === 'inventory'
                            ? 'bg-neutral-800 text-white border border-neutral-700'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <FontAwesomeIcon icon={faTh} />
                        <span>Inventory</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-900 text-neutral-400">
                          {playerDetail?.inventory.length || 0}
                        </span>
                      </button>

                      <button
                        onClick={() => setInventoryView('ender_chest')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          inventoryView === 'ender_chest'
                            ? 'bg-neutral-800 text-white border border-neutral-700'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        <FontAwesomeIcon icon={faBoxArchive} />
                        <span>Ender Chest</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-900 text-neutral-400">
                          {playerDetail?.ender_chest.length || 0}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadPlayerDetails(selectedPlayer, true)}
                        disabled={loadingDetail}
                        className="text-xs px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition-colors flex items-center gap-1.5"
                        title="Reload player inventory data from disk"
                      >
                        <FontAwesomeIcon
                          icon={faSyncAlt}
                          className={`${loadingDetail ? 'animate-spin' : ''}`}
                        />
                        <span>Sync</span>
                      </button>
                    </div>
                  </div>

                  {loadingDetail && !playerDetail ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-16 text-neutral-400">
                      <FontAwesomeIcon icon={faSyncAlt} className="animate-spin text-2xl mb-2 text-primary-400" />
                      <span className="text-xs">Reading playerdata NBT storage...</span>
                    </div>
                  ) : inventoryView === 'inventory' ? (
                    <div className="flex flex-col gap-4">
                      {/* Equipment Row: Helmet, Chestplate, Leggings, Boots, Offhand */}
                      <div className="flex items-center justify-between bg-neutral-900/60 p-3 rounded-xl border border-neutral-800/80">
                        <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">
                          Equipment
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Slot 103: Helmet */}
                          <InventorySlot item={getItemAtSlot(playerDetail?.inventory || [], 103)} placeholder="Helmet" />
                          {/* Slot 102: Chestplate */}
                          <InventorySlot item={getItemAtSlot(playerDetail?.inventory || [], 102)} placeholder="Chestplate" />
                          {/* Slot 101: Leggings */}
                          <InventorySlot item={getItemAtSlot(playerDetail?.inventory || [], 101)} placeholder="Leggings" />
                          {/* Slot 100: Boots */}
                          <InventorySlot item={getItemAtSlot(playerDetail?.inventory || [], 100)} placeholder="Boots" />
                          <div className="w-[1px] h-8 bg-neutral-800 mx-1" />
                          {/* Slot -106 / 150: Offhand */}
                          <InventorySlot
                            item={
                              getItemAtSlot(playerDetail?.inventory || [], -106) ||
                              getItemAtSlot(playerDetail?.inventory || [], 150)
                            }
                            placeholder="Offhand"
                          />
                        </div>
                      </div>

                      {/* Main Inventory 3x9 Grid (Slots 9 to 35) */}
                      <div className="bg-neutral-900/40 p-3 rounded-xl border border-neutral-800/80">
                        <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                          Main Inventory
                        </div>
                        <div className="grid grid-cols-9 gap-1.5">
                          {Array.from({ length: 27 }, (_, i) => i + 9).map((slotIndex) => (
                            <InventorySlot
                              key={slotIndex}
                              item={getItemAtSlot(playerDetail?.inventory || [], slotIndex)}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Hotbar 1x9 Grid (Slots 0 to 8) */}
                      <div className="bg-neutral-900/70 p-3 rounded-xl border border-neutral-800">
                        <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider mb-2">
                          Hotbar
                        </div>
                        <div className="grid grid-cols-9 gap-1.5">
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
                    /* Ender Chest 3x9 Grid (Slots 0 to 26) */
                    <div className="bg-neutral-900/40 p-4 rounded-xl border border-neutral-800/80 flex-1">
                      <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <FontAwesomeIcon icon={faBoxArchive} className="text-primary-400" />
                        <span>Ender Chest Storage (27 Slots)</span>
                      </div>
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

            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Kick Reason
            </label>
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

            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Ban Reason
            </label>
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
 * Individual Inventory Slot Component with Hover Tooltip
 */
function InventorySlot({
  item,
  isHotbar = false,
  placeholder,
}: {
  item?: InventoryItem;
  isHotbar?: boolean;
  placeholder?: string;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border transition-all ${
        item
          ? 'bg-neutral-900 border-neutral-700/80 hover:border-primary-400 hover:scale-105 shadow-inner'
          : isHotbar
          ? 'bg-neutral-950/80 border-neutral-800'
          : 'bg-neutral-950/50 border-neutral-800/60'
      }`}
    >
      {item ? (
        <>
          <img
            src={`https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/item/${item.clean_id}.png`}
            alt={item.name}
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain pointer-events-none"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              // Try block texture if item texture not found
              const target = e.target as HTMLImageElement;
              if (!target.src.includes('/block/')) {
                target.src = `https://assets.mcasset.cloud/1.20.4/assets/minecraft/textures/block/${item.clean_id}.png`;
              } else {
                target.style.display = 'none';
              }
            }}
          />

          {/* Stack Count Badge */}
          {item.count > 1 && (
            <span
              className="absolute bottom-0.5 right-1 font-mono font-black text-[11px] text-white select-none pointer-events-none drop-shadow-[0_1.5px_1px_rgba(0,0,0,1)]"
              style={{
                textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
              }}
            >
              {item.count}
            </span>
          )}

          {/* Rich Tooltip on Hover */}
          {hovered && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-52 bg-neutral-950/95 border border-purple-500/50 rounded-xl p-2.5 shadow-2xl backdrop-blur-md text-left">
              <div className="text-xs font-bold text-white mb-0.5">{item.name}</div>
              <div className="text-[10px] font-mono text-neutral-400 mb-1.5">{item.id}</div>

              {item.enchantments && item.enchantments.length > 0 && (
                <div className="border-t border-neutral-800/80 pt-1 mt-1 flex flex-col gap-0.5">
                  {item.enchantments.map((ench, idx) => (
                    <div key={idx} className="text-[11px] text-purple-300 font-medium">
                      {formatEnchantmentName(ench.id)} {toRoman(ench.lvl)}
                    </div>
                  ))}
                </div>
              )}

              {item.lore && item.lore.length > 0 && (
                <div className="border-t border-neutral-800/80 pt-1 mt-1 text-[10px] text-cyan-200/80 italic flex flex-col gap-0.5">
                  {item.lore.map((l, lIdx) => (
                    <div key={lIdx}>{l}</div>
                  ))}
                </div>
              )}

              {item.damage !== undefined && item.damage > 0 && (
                <div className="text-[10px] text-amber-400 mt-1">Durability Damaged: {item.damage}</div>
              )}
            </div>
          )}
        </>
      ) : placeholder ? (
        <span className="text-[9px] text-neutral-600 font-semibold select-none text-center px-1 leading-tight">
          {placeholder}
        </span>
      ) : null}
    </div>
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
