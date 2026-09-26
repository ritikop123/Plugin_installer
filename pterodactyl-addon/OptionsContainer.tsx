import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGamepad,
  faShieldAlt,
  faSkullCrossbones,
  faGlobe,
  faCloudUploadAlt,
  faCamera,
  faTrashAlt,
  faCopy,
  faCheck,
  faLock,
  faPalette,
  faMinus,
  faPlus,
  faSpinner,
  faExclamationTriangle,
  faFileArchive,
  faCheckCircle,
  faSearch,
  faTimes,
  faSlidersH,
  faLayerGroup,
  faMagic,
  faServer,
  faCogs,
  faSignal,
  faRedo,
} from '@fortawesome/free-solid-svg-icons';

export interface ServerSoftwareInfo {
  id: string;
  name: string;
  category: 'java' | 'bedrock' | 'proxy';
  version?: string | null;
  build?: string | null;
  supports_plugins?: boolean;
  supports_mods?: boolean;
  config_file?: string;
}

interface OptionsApiResponse {
  success: boolean;
  software?: ServerSoftwareInfo;
  address?: string;
  port?: number;
  server_name?: string;
  has_custom_icon?: boolean;
  icon_data?: string | null;
  default_icon?: string | null;
  default_motd?: string;
  file_exists?: boolean;
  properties?: Record<string, string>;
  expire_at?: string | null;
  is_suspended?: boolean;
}

// Default 64x64 Minecraft Server Icon for Sagarmatha Hosting
const DEFAULT_MC_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdt4HsAAADAFBMVEVHcEwZKj0fRmAec6kWndwXoeEUgrsnUnIhIR8LJk0Sk9Mgbp0VgbkUZJYMJ1ATjccRaaIIKF4DLW0Veq8UlNEKaq4CKGYToN8BLG4KesAGL14UkcsfIyQQf70LitETmNUTnd8Tl9dTbJcIcLcCIlsLk9sSmdgKbrIEIlYLOWmkfyobntoRg8ATiscGa7QOY58Hc74DJV8Nic4PltoOhscEK2UMPH0TndwDXakCLG0CKWkJg8oJcLYFbbkNktYFescMcbEHhtABLW8Qm90Tl9UBKGYDe8tpqdjNjxcGg9ECKWrqoQ0FU5kFWJ4CJGLsnwg2pthUnctsmbMSFBV2oLUGgM1iXEusu8sGeMPc5uwQM0kMTpQIhs8Sk9MNjM9LV1oDJ2QBKmsIQ3XTlh27iCACKmsEYq8DabcCTJAHfccDcMDlnQzkng8Hcr5icFf5qgT0pwjzpwgBJGFbptA7p9ljaWwcV3QjJid5lK5nlLELYaQYP3q1y9729/gXSGAHQIEFb7yUqsMAeMp/YSMCL3MAJmcALG/9/fwBK23///77/Pv//v0AKGv+/v0ENHcCfM4EQYcEOX7h8/gBL3MFU5zGzdny9fYDecoGLm7W7vb4+/vq9fgDgdEHWKJNaJQMMnAQpOWTo7oHhtMNfckCZbYEabjy+foDPYPN1uAFS5UJjtkqSnyCk7AEbb0AJWkMmeASN3Pm6+7V3OWtt8UEXann8PXf5+5dc5tsgaQtTYKyvcwHccAbRoL3+fmp3vCR2fCs0+q9ydd0h6iv4/Tt7/IZPXfc4eg9WYm7xNPP6fSZ2e8GSI9Krd/K7PZuwOgFidaMnLdheqGjrr6dqsAEYK9EX401UoTT4urB5fOhz+RFSEmIz+y+4O5YsOAZiMsqbY241usFRYw5p98IZbA7mNGpyOJXodZrhamAtNxgm814g4m93u10d3iXxuSExec3g7WUwuNqfqI6k9KKj5FAT1ZgdoCLr8CboaRku+QPhNAWd6RkiJy3xNaiutNtkbhTiLrLdp3XAAAAhnRSTlMAAwYeyf0OCgEeeQ8qJzZSTI/YGF1dre3zngxq+DOvofaQ/pBI/rE6KBQZv3ZBrkTVaYjPm1X919f4ytpsyNzkgebs57rA9P8s/L2asIWDY7KLVHH+yzNLwOqp+cKty2p64GoLUOWh4zLZ9LKC7E394cWbaJnw991Defvpwu3Bl9+D+5P85/aAq4AAAAV+SURBVFjD7ZZldBNZGIabpGmaNHV3d6UtdVyKuzssvsAC6+7JTDqZTDyZeNqkTt2butEW6lBcijussb6TFg5y2AOFP7vn9D0z98yPed77Xfm+ew0MxjSmMf1PZLbizXgfq29nvVH/Vg4b576Bg1lCB7xl4dtBr8sHJFzItJofdOB1Hchz2ENsyyT/he/MfWu0bGCAk57vT/tuvIVj0IFROwTafT/DMoFbzOJtC7DYZbFw//49+NHwTgcVFRXNIq4sF5lj6p0YsW/rvj1bcaPgLVsrC5oKi8orEHiBf2KiNGx+XPisIAOf8a/G4xe0tjAL20pBsFcU72OeNZuVq9HE7TRY+enUV3LAbYrvAwuOAdn368uhzeTIPHXytetVaXFff95A2+zzct54XLyiDRTkNEOH8vMBO3x0nvoaqLueJuvRFVZwrcxezjtwaQ06JlqokudDwAKzDcqsByXgZU3xWj6ogpGEgJfEj/EIV5HTgoKgjj8A2I3fq8xLPQ+W3JUhV9ECeSYyg/zvMMkYv8kBLuYBAJBd1tfCBEsHoIPzU31ZyShaWP8HX5fy55CGbRf4Qtok1NbClGwZn67J5YpEEAQB2UVMsBuiWYYJWWdL6XQmCDLogr+rhmC7j1YSnJ7DSUnrHP3xZDtuR5UQUah6BxQQdKgMBbsBtoPlBBbrHpNx+fpfV/kgXybk0bxWr/5ssS3hKTzQcXa0iYHZDO6FjuJMoIEONrXlePXwmQI5TcOb+uUk1iVsGqv6uXIB2nAhFwF6mpilyRGTH1tQLZKkU6hY7eGyYTiTBsj5AlAfL4iqFOnSLt62eTNT61JKHkhlikqwpSJdBgNlBaDgijDCYpgnRJs6SncRxk2liWg0mAvQoHy5qjKjJaOyXEGT5QrVPKt531wR0O91qRF5E9gngtlYJxkp51NZk8L1Bs7T8d6smfMcaMMC9C8EiJqrq2MAIDOtv3ioime1I7UOLLmUlQqrmIIyCPsHOlaAGQjD9DnqHhvov1eogWlPBAC0zDQZG0jnITHV1dWZ6TG5V3SCa2pfWXYL2JYPAFBztyCZxRJO0K+Gp9LZIGm3sP8ZBySNBwNAjFcfv7CQ31uWj6ReHahGeEPs8qJWEaTw4qO3f5WyhN76IZgT7c1xtjuEmvQnPLu4AwujoqhE3Fhb294obmuFaRX3c3J6skWiQ/lelQLt7bNSFmuVKUm/hfyU9hTrndt3V/HYjwy4CPYFtGZw2k/V1jTW1NY2Zshzbh45ckSc0XCsvF6nPX1GrZbOdCSED68k1VCpNLQhhG//KleWzh2ZA/0w+Zz2QQlKpzO0nMaaAgkHk1gsaWJI6jqzurpmr7IlmYeMlCmqH1FJjKKE+tt6T4hbi7Dh7J5uVXmOdpCD0Yzhh8PBGjo9BeUM3rnom5U1xc3WyYgynfo4EZxjico8jyi3yMneYRGfZN+oPM7R6lAtxmL0SMuko5LDdUcvEvN8J7qFuOKNbAwNXZ/sZmtnv2l5eb5Zaql0+Zoffz5xou60GGU8NkC1nMM1px52Ej2mRa2nmBNwOCrF0N79qWwwJpFNXW0i3dYtn5TounHZsp9u9GaU6BjDQsWnT9x5eKbz0t1zH3yxBqtIJKqznz0x2PyZQk+2mOzoSaFEuk0JIX28xNLl5K2i0kcGDK1EIik5Xv/LrZMuLi5bbDyD7YnT3M2Nnk9o15D1URMnbogmkEwMjJe6nPyBL8BWgJ6CiclkCErrVb+fO/fbWQ+iR6y7jekLDwmcibW1ifFIZV/64ftFx8Vi8eHDgzdr2k8dfdh5kUj0sI8N9nQOtX6VIwZHXrHk3cXvLVoUbKjXdD93T4pNKNWaNMozFoc3GhYep4/M2HjsxjemMf2H9Q+muYbrNknbvQAAAABJRU5ErkJggg==';
const DEFAULT_MOTD = 'Server Hosting at §b§n§lSagarmatha Hosting';

// Minecraft 16 Standard Colors
const MC_COLORS = [
  { code: '0', hex: '#000000', name: 'Black' },
  { code: '1', hex: '#0000AA', name: 'Dark Blue' },
  { code: '2', hex: '#00AA00', name: 'Dark Green' },
  { code: '3', hex: '#00AAAA', name: 'Dark Aqua' },
  { code: '4', hex: '#AA0000', name: 'Dark Red' },
  { code: '5', hex: '#AA00AA', name: 'Dark Purple' },
  { code: '6', hex: '#FFAA00', name: 'Gold' },
  { code: '7', hex: '#AAAAAA', name: 'Gray' },
  { code: '8', hex: '#555555', name: 'Dark Gray' },
  { code: '9', hex: '#5555FF', name: 'Blue' },
  { code: 'a', hex: '#55FF55', name: 'Green' },
  { code: 'b', hex: '#55FFFF', name: 'Aqua' },
  { code: 'c', hex: '#FF5555', name: 'Red' },
  { code: 'd', hex: '#FF55FF', name: 'Light Purple' },
  { code: 'e', hex: '#FFFF55', name: 'Yellow' },
  { code: 'f', hex: '#FFFFFF', name: 'White' },
];

const COLOR_MAP: Record<string, string> = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  'a': '#55FF55',
  'b': '#55FFFF',
  'c': '#FF5555',
  'd': '#FF55FF',
  'e': '#FFFF55',
  'f': '#FFFFFF',
};

// Minecraft Formatting Codes
const MC_FORMATS = [
  { code: 'l', name: 'Bold', label: 'B', style: 'font-bold' },
  { code: 'o', name: 'Italic', label: 'I', style: 'italic' },
  { code: 'n', name: 'Underline', label: 'U', style: 'underline' },
  { code: 'm', name: 'Strikethrough', label: 'S', style: 'line-through' },
  { code: 'k', name: 'Magic', label: 'k', style: 'font-mono' },
  { code: 'r', name: 'Reset', label: 'Reset', style: 'text-neutral-400' },
];

// Presets for Quick 1-Click MOTD styling
const MOTD_PRESETS = [
  { name: 'Sagarmatha', value: 'Server Hosting at §b§n§lSagarmatha Hosting' },
  { name: 'Flame Gold', value: '§6§l🔥 MY SERVER §r§7» §e§lFACTIONS §7[§a1.20§7]' },
  { name: 'Ice Aqua', value: '§b§l❄ SURVIVAL NETWORK §r§7» §3§lCUSTOM ENCHANTS' },
  { name: 'Neon Green', value: '§a§l✔ WELCOME TO THE SERVER §r§7» §2§lJOIN NOW!' },
  { name: 'Galaxy SMP', value: '§d§l✦ GALAXY SMP ✦ §r§7» §5§lCROSSPLAY JAVA & BEDROCK' },
  { name: 'Rainbow', value: '§cR§6a§ei§an§bb§9o§dw §f§lServer §7• §eCome Play!' },
];

// Default fallback values dictionary for Minecraft server.properties
const DEFAULT_VALUES: Record<string, string> = {
  'max-players': '20',
  'gamemode': 'survival',
  'difficulty': 'easy',
  'hardcore': 'false',
  'force-gamemode': 'false',
  'online-mode': 'true',
  'white-list': 'false',
  'enforce-whitelist': 'false',
  'prevent-proxy-connections': 'false',
  'pvp': 'true',
  'allow-flight': 'false',
  'enable-command-block': 'false',
  'allow-nether': 'true',
  'spawn-protection': '16',
  'spawn-monsters': 'true',
  'spawn-animals': 'true',
  'spawn-npcs': 'true',
  'view-distance': '10',
  'simulation-distance': '10',
  'require-resource-pack': 'false',
  'entity-broadcast-range-percentage': '100',
  'network-compression-threshold': '256',
  'max-tick-time': '60000',
  'sync-chunk-writes': 'true',
  // Bedrock defaults
  'allow-cheats': 'false',
  'tick-distance': '4',
  'player-idle-timeout': '30',
  'default-player-permission-level': 'member',
  'texturepack-required': 'false',
};

// Parser to convert Minecraft formatting codes into styled React spans
function renderMotdSpans(rawText: string): React.ReactNode[] {
  const textToRender = rawText && rawText.trim() !== '' ? rawText : DEFAULT_MOTD;
  const normalized = textToRender.replace(/\\u00A7/gi, '§');
  const tokens: React.ReactNode[] = [];
  let currentColor = '#FFFFFF';
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrikethrough = false;
  let currentBuffer = '';

  const flush = () => {
    if (!currentBuffer) return;
    tokens.push(
      <span
        key={tokens.length}
        style={{
          color: currentColor,
          fontWeight: isBold ? 'bold' : 'normal',
          fontStyle: isItalic ? 'italic' : 'normal',
          textDecoration: [
            isUnderline ? 'underline' : '',
            isStrikethrough ? 'line-through' : '',
          ]
            .filter(Boolean)
            .join(' ') || 'none',
          textShadow: '2px 2px 0px rgba(0,0,0,0.85)',
        }}
      >
        {currentBuffer}
      </span>
    );
    currentBuffer = '';
  };

  let i = 0;
  while (i < normalized.length) {
    const char = normalized[i];
    if ((char === '§' || char === '&') && i + 1 < normalized.length) {
      const code = normalized[i + 1].toLowerCase();
      if (COLOR_MAP[code] !== undefined) {
        flush();
        currentColor = COLOR_MAP[code];
        isBold = false;
        isItalic = false;
        isUnderline = false;
        isStrikethrough = false;
        i += 2;
        continue;
      } else if (code === 'l') {
        flush();
        isBold = true;
        i += 2;
        continue;
      } else if (code === 'm') {
        flush();
        isStrikethrough = true;
        i += 2;
        continue;
      } else if (code === 'n') {
        flush();
        isUnderline = true;
        i += 2;
        continue;
      } else if (code === 'o') {
        flush();
        isItalic = true;
        i += 2;
        continue;
      } else if (code === 'r') {
        flush();
        currentColor = '#FFFFFF';
        isBold = false;
        isItalic = false;
        isUnderline = false;
        isStrikethrough = false;
        i += 2;
        continue;
      }
    }

    if (char === '\n' || (char === '\\' && normalized[i + 1] === 'n')) {
      flush();
      tokens.push(<br key={tokens.length} />);
      if (char === '\\') i++;
      i++;
      continue;
    }

    currentBuffer += char;
    i++;
  }

  flush();
  return tokens;
}

// =========================================================================
// SLEEK UI ATOMS: Toggle Switch, Number Stepper, Setting Row
// =========================================================================

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (val: boolean) => void;
  activeColor?: 'cyan' | 'emerald' | 'rose' | 'amber';
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, activeColor = 'cyan', disabled = false }) => {
  const colorClasses = {
    cyan: 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-cyan-500/25',
    emerald: 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-emerald-500/25',
    rose: 'bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-500/25',
    amber: 'bg-gradient-to-r from-amber-500 to-yellow-500 shadow-amber-500/25',
  }[activeColor];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none ${
        checked ? `${colorClasses} shadow-md` : 'bg-neutral-800 hover:bg-neutral-700/80'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
};

interface StepperProps {
  value: number | string;
  onChange: (val: string) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const Stepper: React.FC<StepperProps> = ({ value, onChange, min = 0, max = 10000, step = 1, unit = '' }) => {
  const num = typeof value === 'number' ? value : parseInt(value, 10) || 0;

  return (
    <div className="inline-flex items-center rounded-xl bg-neutral-950 border border-neutral-800 shadow-inner p-0.5">
      <button
        type="button"
        onClick={() => {
          if (num > min) onChange((num - step).toString());
        }}
        disabled={num <= min}
        className="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <FontAwesomeIcon icon={faMinus} className="text-[10px]" />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-14 bg-transparent text-center text-xs font-mono font-bold text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {unit && <span className="text-[10px] text-neutral-500 font-mono pr-1.5">{unit}</span>}
      <button
        type="button"
        onClick={() => {
          if (num < max) onChange((num + step).toString());
        }}
        disabled={num >= max}
        className="w-7 h-7 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
      </button>
    </div>
  );
};

interface SettingRowProps {
  label: string;
  propKey: string;
  desc: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, propKey, desc, badge, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 px-3.5 rounded-xl hover:bg-neutral-800/30 border border-transparent hover:border-neutral-800/60 transition-all">
    <div className="space-y-0.5 max-w-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-neutral-200 tracking-tight">{label}</label>
        <span className="text-[10px] font-mono text-neutral-500 bg-neutral-950/70 border border-neutral-800 px-1.5 py-0.2 rounded">
          {propKey}
        </span>
        {badge}
      </div>
      <p className="text-[11px] text-neutral-400 leading-snug">{desc}</p>
    </div>
    <div className="flex items-center justify-end sm:self-center flex-shrink-0">
      {children}
    </div>
  </div>
);

type TabType = 'all' | 'general' | 'security' | 'gameplay' | 'world' | 'resourcepack' | 'advanced' | 'bedrock';

export default function OptionsContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  const [loading, setLoading] = useState(true);
  const [software, setSoftware] = useState<ServerSoftwareInfo | null>(null);
  const [serverAddress, setServerAddress] = useState<string>('');
  const [serverPort, setServerPort] = useState<number>(25565);
  const [serverName, setServerName] = useState<string>('Minecraft Server');
  const [hasCustomIcon, setHasCustomIcon] = useState<boolean>(false);
  const [iconData, setIconData] = useState<string | null>(null);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [expireAt, setExpireAt] = useState<string | null>(null);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);

  // Auto-Save State
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasChangedInSession, setHasChangedInSession] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPropsRef = useRef<Record<string, string>>({});

  // UI States
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedMotd, setCopiedMotd] = useState(false);
  const [showMotdTools, setShowMotdTools] = useState(false);
  const [motdPrefix, setMotdPrefix] = useState<'§' | '&'>('§');
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [deletingIcon, setDeletingIcon] = useState(false);
  const [uploadingPack, setUploadingPack] = useState(false);
  const [deletingPack, setDeletingPack] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const packInputRef = useRef<HTMLInputElement | null>(null);
  const motdTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isBedrock = software?.category === 'bedrock';
  const isProxy = software?.category === 'proxy';

  // Load Initial Options
  const loadOptions = useCallback(async () => {
    try {
      const res = await http.get<OptionsApiResponse>(`/api/client/servers/${uuid}/options`);
      if (res.data.success) {
        if (res.data.software) setSoftware(res.data.software);
        if (res.data.address) setServerAddress(res.data.address);
        if (res.data.port) setServerPort(res.data.port);
        if (res.data.server_name) setServerName(res.data.server_name);
        setHasCustomIcon(!!res.data.has_custom_icon);
        setIconData(res.data.icon_data || null);
        setProperties(res.data.properties || {});
        setExpireAt(res.data.expire_at || null);
        setIsSuspended(!!res.data.is_suspended);
        pendingPropsRef.current = res.data.properties || {};
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Debounced auto-save function
  const triggerAutoSave = useCallback(
    (newProps: Record<string, string>) => {
      setAutoSaveStatus('saving');
      setHasChangedInSession(true);

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await http.post(`/api/client/servers/${uuid}/options`, {
            properties: newProps,
          });
          if (res.data.success) {
            setAutoSaveStatus('saved');
            setTimeout(() => {
              setAutoSaveStatus('idle');
            }, 3000);
          } else {
            setAutoSaveStatus('error');
          }
        } catch (err) {
          console.error(err);
          setAutoSaveStatus('error');
        }
      }, 750);
    },
    [uuid]
  );

  const updateProp = (key: string, val: string, saveImmediately = false) => {
    const updated = { ...properties, [key]: val };
    setProperties(updated);
    pendingPropsRef.current = updated;

    if (saveImmediately) {
      triggerAutoSave(updated);
    } else {
      triggerAutoSave(updated);
    }
  };

  const toggleBoolProp = (key: string, defaultVal = false) => {
    const current = properties[key] !== undefined ? properties[key].toLowerCase() === 'true' : defaultVal;
    updateProp(key, (!current).toString(), true);
  };

  const getProp = (key: string, fallback = '') => {
    if (properties[key] !== undefined) return properties[key];
    if (DEFAULT_VALUES[key] !== undefined) return DEFAULT_VALUES[key];
    return fallback;
  };

  const getBoolProp = (key: string, fallback = false): boolean => {
    if (properties[key] !== undefined) {
      return properties[key].toLowerCase() === 'true';
    }
    if (DEFAULT_VALUES[key] !== undefined) {
      return DEFAULT_VALUES[key].toLowerCase() === 'true';
    }
    return fallback;
  };

  // Copy Handlers
  const handleCopyAddress = () => {
    if (!serverAddress) return;
    navigator.clipboard.writeText(serverAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleCopyMotd = () => {
    const raw = getProp('motd', DEFAULT_MOTD);
    navigator.clipboard.writeText(raw);
    setCopiedMotd(true);
    setTimeout(() => setCopiedMotd(false), 2000);
  };

  const handleInsertCode = (code: string) => {
    const insertStr = `${motdPrefix}${code}`;
    const textarea = motdTextareaRef.current;
    const currentVal = getProp('motd', DEFAULT_MOTD);
    if (!textarea) {
      updateProp('motd', currentVal + insertStr, false);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = currentVal.substring(0, start) + insertStr + currentVal.substring(end);
    updateProp('motd', updated, false);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertStr.length, start + insertStr.length);
    }, 0);
  };

  const handleApplyMotdPreset = (presetVal: string) => {
    updateProp('motd', presetVal, true);
  };

  // Icon File Upload Handler
  const handleIconSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setToastError('Unable to process image on this browser.');
          return;
        }

        ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0, 64, 64);
        const base64Png = canvas.toDataURL('image/png');

        setUploadingIcon(true);
        setToastError(null);
        setToastMessage(null);
        try {
          const res = await http.post(`/api/client/servers/${uuid}/options/icon`, {
            icon_data: base64Png,
          });
          if (res.data.success) {
            setIconData(res.data.icon_data || base64Png);
            setHasCustomIcon(true);
            setToastMessage('Server icon updated! Restart server to see it in multiplayer lists.');
            setTimeout(() => setToastMessage(null), 5000);
          }
        } catch (err) {
          console.error(err);
          setToastError(httpErrorToHuman(err));
        } finally {
          setUploadingIcon(false);
        }
      };
      img.src = uploadEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteIcon = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Revert server icon to default Sagarmatha Hosting logo?')) return;

    setDeletingIcon(true);
    setToastError(null);
    setToastMessage(null);
    try {
      const res = await http.delete(`/api/client/servers/${uuid}/options/icon`);
      if (res.data.success) {
        setIconData(res.data.icon_data || DEFAULT_MC_ICON);
        setHasCustomIcon(false);
        setToastMessage('Server icon reverted to default Sagarmatha logo.');
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setDeletingIcon(false);
    }
  };

  // Resource Pack Upload Handler
  const handlePackSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.toLowerCase().endsWith('.zip')) {
      setToastError('Please select a valid .zip resource pack file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingPack(true);
    setToastError(null);
    setToastMessage(null);
    try {
      const res = await http.post(`/api/client/servers/${uuid}/options/resourcepack`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setProperties((prev) => ({
          ...prev,
          'resource-pack': res.data.url,
          'resource-pack-sha1': res.data.sha1,
        }));
        setToastMessage('Resource pack uploaded and automatically linked in server.properties!');
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setUploadingPack(false);
    }
  };

  const handleDeletePack = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete server resource pack from disk?')) return;

    setDeletingPack(true);
    setToastError(null);
    setToastMessage(null);
    try {
      const res = await http.delete(`/api/client/servers/${uuid}/options/resourcepack`);
      if (res.data.success) {
        setProperties((prev) => {
          const c = { ...prev };
          delete c['resource-pack'];
          delete c['resource-pack-sha1'];
          return c;
        });
        setToastMessage('Resource pack removed from server.');
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setDeletingPack(false);
    }
  };

  // Search & Filter Index of Settings
  const settingsList = useMemo(() => {
    return [
      { key: 'max-players', label: 'Max Player Slots', category: 'general', tags: ['slots', 'capacity', 'players'] },
      { key: 'gamemode', label: 'Default Gamemode', category: 'general', tags: ['mode', 'survival', 'creative', 'adventure'] },
      { key: 'difficulty', label: 'Difficulty', category: 'general', tags: ['peaceful', 'easy', 'normal', 'hard'] },
      { key: 'hardcore', label: 'Hardcore Mode', category: 'general', tags: ['permadeath', 'ban', 'death'] },
      { key: 'force-gamemode', label: 'Force Gamemode', category: 'general', tags: ['gamemode', 'rejoin', 'reset'] },

      { key: 'online-mode', label: isBedrock ? 'Xbox Live Login' : 'Cracked / Offline Mode', category: 'security', tags: ['cracked', 'offline', 'auth', 'premium'] },
      { key: 'white-list', label: 'Whitelist Enforcement', category: 'security', tags: ['whitelist', 'access', 'private'] },
      { key: 'enforce-whitelist', label: 'Kick on Whitelist Removal', category: 'security', tags: ['kick', 'enforce', 'whitelist'] },
      { key: 'prevent-proxy-connections', label: 'Block VPN & Proxies', category: 'security', tags: ['vpn', 'proxy', 'security'] },

      { key: 'pvp', label: 'Player vs Player (PvP)', category: 'gameplay', tags: ['pvp', 'combat', 'damage', 'fight'] },
      { key: 'allow-flight', label: 'Allow Flight', category: 'gameplay', tags: ['fly', 'flight', 'kick', 'mods'] },
      { key: 'enable-command-block', label: 'Command Blocks', category: 'gameplay', tags: ['commands', 'redstone', 'blocks'] },
      { key: 'allow-nether', label: 'Allow Nether Dimension', category: 'gameplay', tags: ['nether', 'portals', 'world'] },
      { key: 'spawn-protection', label: 'Spawn Protection Radius', category: 'gameplay', tags: ['spawn', 'protect', 'radius'] },

      { key: 'spawn-monsters', label: 'Spawn Hostile Monsters', category: 'world', tags: ['mobs', 'zombies', 'monsters', 'hostile'] },
      { key: 'spawn-animals', label: 'Spawn Passive Animals', category: 'world', tags: ['animals', 'sheep', 'cows', 'passive'] },
      { key: 'spawn-npcs', label: 'Spawn Villagers & NPCs', category: 'world', tags: ['villagers', 'npcs', 'traders'] },
      { key: 'view-distance', label: 'View Distance', category: 'world', tags: ['render', 'chunks', 'distance'] },
      { key: 'simulation-distance', label: 'Simulation Distance', category: 'world', tags: ['simulation', 'ticks', 'chunks'] },

      // Bedrock
      { key: 'allow-cheats', label: 'Allow In-Game Cheats', category: 'bedrock', tags: ['cheats', 'commands', 'bedrock'], hidden: !isBedrock },
      { key: 'tick-distance', label: 'Tick Distance (Bedrock)', category: 'bedrock', tags: ['tick', 'distance', 'bedrock'], hidden: !isBedrock },
      { key: 'player-idle-timeout', label: 'Idle Timeout (Minutes)', category: 'bedrock', tags: ['afk', 'idle', 'timeout'], hidden: !isBedrock },
      { key: 'default-player-permission-level', label: 'Default Permission Level', category: 'bedrock', tags: ['permission', 'visitor', 'member'], hidden: !isBedrock },

      // Advanced
      { key: 'entity-broadcast-range-percentage', label: 'Entity Broadcast Range %', category: 'advanced', tags: ['entities', 'broadcast', 'lag'], hidden: isBedrock || isProxy },
      { key: 'network-compression-threshold', label: 'Compression Threshold', category: 'advanced', tags: ['compression', 'packets', 'network'], hidden: isProxy },
      { key: 'max-tick-time', label: 'Watchdog Max Tick Time', category: 'advanced', tags: ['watchdog', 'crash', 'tick'], hidden: isBedrock || isProxy },
      { key: 'sync-chunk-writes', label: 'Sync Chunk Writes', category: 'advanced', tags: ['disk', 'chunks', 'io'], hidden: isBedrock || isProxy },

      // Resource Pack
      { key: 'resource-pack', label: 'Resource Pack URL', category: 'resourcepack', tags: ['pack', 'texture', 'zip'] },
      { key: 'require-resource-pack', label: 'Require Resource Pack', category: 'resourcepack', tags: ['enforce', 'pack', 'kick'] },
    ].filter((item) => !item.hidden);
  }, [isBedrock, isProxy]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: settingsList.length,
      general: 0,
      security: 0,
      gameplay: 0,
      world: 0,
      resourcepack: 2,
      advanced: 0,
      bedrock: 0,
    };
    settingsList.forEach((s) => {
      if (counts[s.category] !== undefined) counts[s.category]++;
    });
    return counts;
  }, [settingsList]);

  const filteredSettings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return settingsList.filter((item) => {
      if (activeTab !== 'all' && item.category !== activeTab) return false;
      if (!query) return true;
      return (
        item.key.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query) ||
        item.tags.some((t) => t.includes(query))
      );
    });
  }, [settingsList, activeTab, searchQuery]);

  const matchesKey = (key: string) => filteredSettings.some((item) => item.key === key);
  const isCategoryVisible = (cat: string) => {
    if (activeTab !== 'all' && activeTab !== cat) return false;
    return filteredSettings.some((item) => item.category === cat);
  };

  if (loading) {
    return (
      <ServerContentBlock title="Server Options">
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <FontAwesomeIcon icon={faSpinner} spin className="text-cyan-400 text-3xl" />
          <p className="text-neutral-400 text-sm font-medium">Loading server configuration & properties...</p>
        </div>
      </ServerContentBlock>
    );
  }

  return (
    <ServerContentBlock title="Server Options">
      <div className="space-y-6 pb-12 max-w-7xl mx-auto">
        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleIconSelected}
        />
        <input
          ref={packInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={handlePackSelected}
        />

        {/* ========================================================================= */}
        {/* TOP STATUS BAR: Software, Live Auto-Save, Session Restart Hint */}
        {/* ========================================================================= */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 px-4 py-2.5 rounded-2xl backdrop-blur-sm">
          {/* Software & Category Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {software ? (
              <span
                className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border font-semibold ${
                  isBedrock
                    ? 'bg-amber-950/60 text-amber-300 border-amber-600/40'
                    : isProxy
                    ? 'bg-purple-950/60 text-purple-300 border-purple-600/40'
                    : 'bg-cyan-950/60 text-cyan-300 border-cyan-600/40'
                }`}
              >
                <FontAwesomeIcon icon={isBedrock ? faGamepad : isProxy ? faServer : faGamepad} className="text-[11px]" />
                <span>
                  {software.name} {software.version ? `v${software.version}` : ''}
                </span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-black/40 text-neutral-300">
                  {software.category}
                </span>
              </span>
            ) : (
              <span className="text-xs text-neutral-400 flex items-center space-x-1.5">
                <FontAwesomeIcon icon={faCogs} className="text-neutral-500" />
                <span>Standard Minecraft Server</span>
              </span>
            )}

            {hasChangedInSession && (
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium animate-pulse">
                <FontAwesomeIcon icon={faRedo} className="text-[10px]" />
                <span>Restart recommended to apply changes</span>
              </span>
            )}
          </div>

          {/* Live Auto-Save Indicator */}
          <div className="flex items-center space-x-2 text-xs font-mono">
            {autoSaveStatus === 'saving' && (
              <span className="text-cyan-400 flex items-center space-x-1.5 bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-1 rounded-full">
                <FontAwesomeIcon icon={faSpinner} spin className="text-[11px]" />
                <span>Saving changes...</span>
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-emerald-400 font-semibold flex items-center space-x-1.5 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full shadow-sm shadow-emerald-500/20">
                <FontAwesomeIcon icon={faCheckCircle} className="text-[11px]" />
                <span>Saved & Synchronized</span>
              </span>
            )}
            {autoSaveStatus === 'error' && (
              <span className="text-red-400 font-semibold flex items-center space-x-1.5 bg-red-950/40 border border-red-500/30 px-2.5 py-1 rounded-full">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-[11px]" />
                <span>Save Error</span>
              </span>
            )}
            {autoSaveStatus === 'idle' && (
              <span className="text-neutral-400 flex items-center space-x-1.5 bg-neutral-800/40 px-2.5 py-1 rounded-full">
                <FontAwesomeIcon icon={faCheck} className="text-[10px] text-emerald-400" />
                <span>Auto-save active</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Banners */}
        {toastMessage && (
          <div className="flex items-center space-x-3 bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl shadow-lg">
            <FontAwesomeIcon icon={faCheck} className="text-emerald-400 text-lg flex-shrink-0" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        )}

        {toastError && (
          <div className="flex items-center space-x-3 bg-red-950/70 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-lg">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 text-lg flex-shrink-0" />
            <span className="text-sm font-medium">{toastError}</span>
          </div>
        )}

        {/* Scheduled Suspension Notice Banner */}
        {(() => {
          if (!expireAt) return null;
          const expTime = new Date(expireAt).getTime();
          const diffMs = expTime - Date.now();
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const isExpiringSoon = daysLeft <= 3 && daysLeft >= 0;

          if (isSuspended) {
            return (
              <div className="flex items-center space-x-3 bg-red-950/80 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-lg">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 text-lg flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">Server Suspended:</span> This server has reached its expiration date. Please renew your plan to reactivate it.
                </div>
              </div>
            );
          }

          if (isExpiringSoon) {
            return (
              <div className="flex items-center space-x-3 bg-amber-950/80 border border-amber-500/50 text-amber-200 px-4 py-3 rounded-xl shadow-lg">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-400 text-lg flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">Scheduled Suspension Notice:</span> This server is scheduled for automatic suspension on{' '}
                  <span className="font-mono text-cyan-300 font-semibold">
                    {new Date(expireAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>{' '}
                  {daysLeft === 0 ? '(Today)' : `(in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'})`}. Please renew your plan to prevent downtime.
                </div>
              </div>
            );
          }

          return null;
        })()}

        {/* ========================================================================= */}
        {/* HERO SECTION: Authentic Minecraft Multiplayer Server Identity Banner */}
        {/* ========================================================================= */}
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
            {/* Left: 64x64 Icon Box & Server Address Details */}
            <div className="flex items-center space-x-4">
              {/* 64x64 Minecraft Server Icon Box */}
              <div
                onClick={() => !uploadingIcon && fileInputRef.current?.click()}
                className="relative group/icon cursor-pointer w-16 h-16 rounded-xl border-2 border-neutral-700/80 hover:border-cyan-500 transition-all duration-200 bg-black/60 overflow-hidden flex-shrink-0 shadow-lg"
                title="Click to upload custom server icon (64×64 PNG, auto-resized)"
              >
                <img
                  src={iconData || '/images/sagarmatha_logo.png'}
                  onError={(e) => {
                    if (e.currentTarget.src !== DEFAULT_MC_ICON) {
                      e.currentTarget.src = DEFAULT_MC_ICON;
                    }
                  }}
                  alt="Server Icon"
                  className="w-full h-full object-cover"
                  style={{ imageRendering: 'pixelated' }}
                />

                {/* Upload Overlay on Hover */}
                <div className="absolute inset-0 bg-black/75 opacity-0 group-hover/icon:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
                  {uploadingIcon ? (
                    <FontAwesomeIcon icon={faSpinner} spin className="text-cyan-400 text-lg" />
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faCamera} className="text-cyan-400 text-sm mb-0.5" />
                      <span className="text-[9px] font-semibold tracking-tighter">CHANGE</span>
                    </>
                  )}
                </div>

                {/* Remove Icon Button */}
                {hasCustomIcon && !uploadingIcon && (
                  <button
                    type="button"
                    onClick={handleDeleteIcon}
                    className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow transition-colors z-20"
                    title="Revert to default Sagarmatha logo"
                  >
                    {deletingIcon ? (
                      <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />
                    ) : (
                      <FontAwesomeIcon icon={faTrashAlt} className="text-[10px]" />
                    )}
                  </button>
                )}
              </div>

              {/* Server Name & Unchangeable Address Badge */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-white tracking-wide">{serverName}</h2>
                  {hasCustomIcon ? (
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-mono border border-emerald-500/30">
                      Custom Icon
                    </span>
                  ) : (
                    <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full font-mono border border-neutral-700">
                      Default Logo
                    </span>
                  )}
                </div>

                {/* Server Address with 1-Click Copy */}
                <div className="flex items-center space-x-2 mt-1.5">
                  <div
                    className="inline-flex items-center space-x-2 bg-neutral-800/90 border border-neutral-700/80 px-2.5 py-1 rounded-lg text-xs font-mono text-cyan-300 select-all cursor-pointer hover:border-cyan-500/60 transition-colors"
                    onClick={handleCopyAddress}
                    title="Click to copy server address"
                  >
                    <FontAwesomeIcon icon={faLock} className="text-neutral-400 text-[10px]" />
                    <span>{serverAddress || 'Allocating port...'}</span>
                    <FontAwesomeIcon
                      icon={copiedAddress ? faCheck : faCopy}
                      className={copiedAddress ? 'text-emerald-400' : 'text-neutral-400 hover:text-cyan-400'}
                    />
                  </div>
                  {copiedAddress && (
                    <span className="text-xs text-emerald-400 font-medium">Copied!</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center space-x-2.5 self-end lg:self-center">
              <button
                type="button"
                onClick={handleCopyMotd}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                title="Copy raw formatted MOTD code to clipboard"
              >
                <FontAwesomeIcon icon={copiedMotd ? faCheck : faCopy} className={copiedMotd ? 'text-emerald-400' : ''} />
                <span>{copiedMotd ? 'Copied MOTD' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMotdTools(!showMotdTools)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  showMotdTools
                    ? 'bg-cyan-500 text-neutral-950 shadow-md shadow-cyan-500/30'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-500/30'
                }`}
              >
                <FontAwesomeIcon icon={faPalette} />
                <span>{showMotdTools ? 'Close Studio' : 'Visual MOTD Studio'}</span>
              </button>
            </div>
          </div>

          {/* Authentic Multiplayer Server List Preview Box */}
          <div className="mt-5 pt-4 border-t border-neutral-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <FontAwesomeIcon icon={faSignal} className="text-emerald-400 text-[10px]" />
                <span>In-Game Multiplayer Server Browser Preview</span>
              </span>
              <div className="flex items-center space-x-3 text-[11px] text-neutral-400 font-mono">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 font-bold">24ms</span>
                </span>
                <span>
                  Slots: <span className="text-white font-bold">{getProp('max-players', '20')}</span>
                </span>
              </div>
            </div>

            <div className="bg-black/90 border border-neutral-800 rounded-xl p-4 min-h-[58px] flex items-center font-mono text-sm leading-relaxed tracking-wide shadow-inner overflow-x-auto select-none">
              <div className="w-full">
                {renderMotdSpans(getProp('motd', DEFAULT_MOTD))}
              </div>
            </div>
          </div>

          {/* Expandable Visual MOTD Studio Drawer */}
          {showMotdTools && (
            <div className="mt-5 pt-4 border-t border-neutral-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-neutral-200 flex items-center space-x-2">
                  <FontAwesomeIcon icon={faMagic} className="text-cyan-400" />
                  <span>Visual MOTD Studio</span>
                  <span className="text-neutral-400 font-normal text-[11px]">(Auto-saves live)</span>
                </label>

                {/* Prefix Selector & Reset */}
                <div className="flex items-center space-x-2 text-xs text-neutral-400">
                  <span>Prefix:</span>
                  <button
                    type="button"
                    onClick={() => setMotdPrefix('§')}
                    className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                      motdPrefix === '§' ? 'bg-cyan-500 text-neutral-900 shadow-sm' : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    §
                  </button>
                  <button
                    type="button"
                    onClick={() => setMotdPrefix('&')}
                    className={`px-2 py-0.5 rounded font-mono font-bold transition-colors ${
                      motdPrefix === '&' ? 'bg-cyan-500 text-neutral-900 shadow-sm' : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    &
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProp('motd', DEFAULT_MOTD, true)}
                    className="ml-2 text-[11px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                  >
                    Reset Default
                  </button>
                </div>
              </div>

              {/* MOTD Input Textarea */}
              <div className="relative">
                <textarea
                  ref={motdTextareaRef}
                  rows={2}
                  value={getProp('motd', DEFAULT_MOTD)}
                  onChange={(e) => updateProp('motd', e.target.value, false)}
                  placeholder="Enter server description (MOTD)..."
                  className="w-full bg-neutral-950/90 border border-neutral-700/80 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:outline-none resize-y"
                />
                <span className="absolute bottom-2.5 right-3 text-[10px] text-neutral-500 font-mono">
                  {getProp('motd', '').length} chars
                </span>
              </div>

              {/* Preset Quick Styles */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Quick Style Presets:
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {MOTD_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleApplyMotdPreset(p.value)}
                      className="px-2.5 py-1 rounded-lg text-xs bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-cyan-500/50 transition-all font-medium"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Code Palette & Formatting Tools */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                {/* 16 Colors */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">Colors</span>
                  <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    {MC_COLORS.map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => handleInsertCode(c.code)}
                        className="w-6 h-6 rounded-md border border-neutral-600/70 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center shadow-sm"
                        style={{ backgroundColor: c.hex }}
                        title={`${c.name} (${motdPrefix}${c.code})`}
                      >
                        <span className="text-[10px] font-mono font-bold opacity-0 hover:opacity-100 text-white drop-shadow">
                          {c.code}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Formats */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider block">Formatting</span>
                  <div className="flex items-center space-x-1 p-1.5 bg-neutral-950/70 border border-neutral-800 rounded-xl">
                    {MC_FORMATS.map((f) => (
                      <button
                        key={f.code}
                        type="button"
                        onClick={() => handleInsertCode(f.code)}
                        className={`px-2 py-1 rounded-md text-xs font-mono font-bold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors ${f.style}`}
                        title={`${f.name} (${motdPrefix}${f.code})`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* NAVIGATION & SEARCH CONTROLS */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings by property key or keyword (e.g. pvp, flight, whitelist, distance)..."
              className="w-full bg-neutral-900/90 border border-neutral-700/80 rounded-xl pl-10 pr-10 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200 p-1"
                title="Clear search"
              >
                <FontAwesomeIcon icon={faTimes} className="text-xs" />
              </button>
            )}
          </div>

          {/* Segmented Category Filter Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {[
              { id: 'all', label: 'All Options', icon: faLayerGroup, count: tabCounts.all },
              { id: 'general', label: 'General', icon: faGamepad, count: tabCounts.general },
              { id: 'security', label: 'Access & Auth', icon: faShieldAlt, count: tabCounts.security },
              { id: 'gameplay', label: 'Gameplay & Combat', icon: faSkullCrossbones, count: tabCounts.gameplay },
              { id: 'world', label: 'World & Spawning', icon: faGlobe, count: tabCounts.world },
              ...(isBedrock ? [{ id: 'bedrock', label: 'Bedrock BDS', icon: faGamepad, count: tabCounts.bedrock }] : []),
              { id: 'resourcepack', label: 'Resource Pack', icon: faCloudUploadAlt, count: tabCounts.resourcepack },
              ...(!isBedrock && !isProxy ? [{ id: 'advanced', label: 'Performance & Network', icon: faSlidersH, count: tabCounts.advanced }] : []),
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-cyan-500 text-neutral-950 shadow-md shadow-cyan-500/20'
                      : 'bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                  }`}
                >
                  <FontAwesomeIcon icon={tab.icon} className="text-xs" />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        active ? 'bg-black/30 text-neutral-950 font-bold' : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Empty Search State */}
        {filteredSettings.length === 0 && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700 mx-auto flex items-center justify-center text-neutral-400">
              <FontAwesomeIcon icon={faSearch} className="text-xl" />
            </div>
            <h4 className="text-base font-bold text-white">No Matching Settings Found</h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              No configuration properties matched your search term &quot;{searchQuery}&quot;. Try adjusting your keywords or clearing the filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveTab('all');
              }}
              className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-neutral-950 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* MAIN CONFIGURATION GRID: Professional Categorized Cards */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ------------------------------------------------------------- */}
          {/* CARD 1: General Server Settings */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('general') && (
            <div className="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-2 transition-all">
              <div className="flex items-center space-x-3 pb-3 mb-2 border-b border-neutral-800/80">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-inner">
                  <FontAwesomeIcon icon={faGamepad} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">General Settings</h3>
                  <p className="text-[11px] text-neutral-400">Core game modes, player slots, and difficulty</p>
                </div>
              </div>

              {matchesKey('max-players') && (
                <SettingRow
                  label={isBedrock ? 'Max Players (Bedrock)' : isProxy ? 'Max Player Slots' : 'Max Players (Slots)'}
                  propKey="max-players"
                  desc="Maximum simultaneous player slots allowed on this server."
                >
                  <Stepper
                    value={getProp('max-players', '20')}
                    onChange={(val) => updateProp('max-players', val, true)}
                    min={1}
                    max={10000}
                  />
                </SettingRow>
              )}

              {matchesKey('gamemode') && (
                <SettingRow
                  label="Default Gamemode"
                  propKey="gamemode"
                  desc="Default game mode assigned to newly connected players."
                >
                  <select
                    value={getProp('gamemode', 'survival').toLowerCase()}
                    onChange={(e) => updateProp('gamemode', e.target.value, true)}
                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-cyan-500 rounded-xl px-3 py-1.5 text-xs text-neutral-200 font-medium cursor-pointer focus:outline-none transition-colors"
                  >
                    <option value="survival">Survival</option>
                    <option value="creative">Creative</option>
                    <option value="adventure">Adventure</option>
                    <option value="spectator">Spectator</option>
                  </select>
                </SettingRow>
              )}

              {matchesKey('difficulty') && (
                <SettingRow
                  label="Difficulty"
                  propKey="difficulty"
                  desc="World hostility, mob aggression, and damage multiplier."
                >
                  <select
                    value={getProp('difficulty', 'easy').toLowerCase()}
                    onChange={(e) => updateProp('difficulty', e.target.value, true)}
                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-cyan-500 rounded-xl px-3 py-1.5 text-xs text-neutral-200 font-medium cursor-pointer focus:outline-none transition-colors"
                  >
                    <option value="peaceful">Peaceful</option>
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </SettingRow>
              )}

              {matchesKey('hardcore') && (
                <SettingRow
                  label="Hardcore Mode"
                  propKey="hardcore"
                  desc="Players are permanently banned upon in-game death."
                  badge={
                    getBoolProp('hardcore', false) && (
                      <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.2 rounded border border-rose-500/30">
                        PERMADEATH
                      </span>
                    )
                  }
                >
                  <ToggleSwitch
                    checked={getBoolProp('hardcore', false)}
                    onChange={() => toggleBoolProp('hardcore', false)}
                    activeColor="rose"
                  />
                </SettingRow>
              )}

              {matchesKey('force-gamemode') && (
                <SettingRow
                  label="Force Gamemode"
                  propKey="force-gamemode"
                  desc="Forces players to reconnect into the default gamemode on join."
                >
                  <ToggleSwitch
                    checked={getBoolProp('force-gamemode', false)}
                    onChange={() => toggleBoolProp('force-gamemode', false)}
                  />
                </SettingRow>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD 2: Access & Authentication */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('security') && (
            <div className="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-2 transition-all">
              <div className="flex items-center space-x-3 pb-3 mb-2 border-b border-neutral-800/80">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
                  <FontAwesomeIcon icon={faShieldAlt} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Access & Authentication</h3>
                  <p className="text-[11px] text-neutral-400">Control who can connect and authenticate on your server</p>
                </div>
              </div>

              {matchesKey('online-mode') && (
                <SettingRow
                  label={isBedrock ? 'Xbox Live Login' : 'Cracked / Offline Mode'}
                  propKey="online-mode"
                  desc={
                    isBedrock
                      ? 'Require Xbox Live accounts for Bedrock clients.'
                      : 'Allow players without an official Mojang/Microsoft account.'
                  }
                  badge={
                    !getBoolProp('online-mode', true) ? (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                        CRACKED ALLOWED
                      </span>
                    ) : (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                        PREMIUM ONLY
                      </span>
                    )
                  }
                >
                  <ToggleSwitch
                    checked={!getBoolProp('online-mode', true)}
                    onChange={() => {
                      const isCracked = !getBoolProp('online-mode', true);
                      updateProp('online-mode', isCracked ? 'true' : 'false', true);
                    }}
                    activeColor="amber"
                  />
                </SettingRow>
              )}

              {matchesKey('white-list') && (
                <SettingRow
                  label="Whitelist"
                  propKey="white-list"
                  desc="Only players listed in whitelist.json can join the server."
                  badge={
                    getBoolProp('white-list', false) && (
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-300 font-bold px-1.5 py-0.2 rounded border border-cyan-500/30">
                        ACTIVE
                      </span>
                    )
                  }
                >
                  <ToggleSwitch
                    checked={getBoolProp('white-list', false)}
                    onChange={() => toggleBoolProp('white-list', false)}
                  />
                </SettingRow>
              )}

              {matchesKey('enforce-whitelist') && (
                <SettingRow
                  label="Enforce Whitelist"
                  propKey="enforce-whitelist"
                  desc="Kick online players immediately when removed from whitelist."
                >
                  <ToggleSwitch
                    checked={getBoolProp('enforce-whitelist', false)}
                    onChange={() => toggleBoolProp('enforce-whitelist', false)}
                  />
                </SettingRow>
              )}

              {matchesKey('prevent-proxy-connections') && (
                <SettingRow
                  label="Block VPN & Proxies"
                  propKey="prevent-proxy-connections"
                  desc="Reject connections originating from known VPN or proxy networks."
                >
                  <ToggleSwitch
                    checked={getBoolProp('prevent-proxy-connections', false)}
                    onChange={() => toggleBoolProp('prevent-proxy-connections', false)}
                  />
                </SettingRow>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD 3: Gameplay & Combat */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('gameplay') && (
            <div className="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-2 transition-all">
              <div className="flex items-center space-x-3 pb-3 mb-2 border-b border-neutral-800/80">
                <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shadow-inner">
                  <FontAwesomeIcon icon={faSkullCrossbones} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Gameplay & Combat</h3>
                  <p className="text-[11px] text-neutral-400">Player combat, flying liberties, and protection rules</p>
                </div>
              </div>

              {matchesKey('pvp') && (
                <SettingRow
                  label="Player vs Player (PvP)"
                  propKey="pvp"
                  desc="Allow players to fight, shoot, and damage each other."
                  badge={
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                        getBoolProp('pvp', true) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      {getBoolProp('pvp', true) ? 'PVP ON' : 'PVP OFF'}
                    </span>
                  }
                >
                  <ToggleSwitch
                    checked={getBoolProp('pvp', true)}
                    onChange={() => toggleBoolProp('pvp', true)}
                  />
                </SettingRow>
              )}

              {matchesKey('allow-flight') && (
                <SettingRow
                  label="Allow Flight"
                  propKey="allow-flight"
                  desc="Prevent auto-kicking survival players when hovering or flying."
                >
                  <ToggleSwitch
                    checked={getBoolProp('allow-flight', false)}
                    onChange={() => toggleBoolProp('allow-flight', false)}
                  />
                </SettingRow>
              )}

              {matchesKey('enable-command-block') && (
                <SettingRow
                  label="Command Blocks"
                  propKey="enable-command-block"
                  desc="Allow command blocks to execute automated server scripts."
                >
                  <ToggleSwitch
                    checked={getBoolProp('enable-command-block', false)}
                    onChange={() => toggleBoolProp('enable-command-block', false)}
                  />
                </SettingRow>
              )}

              {matchesKey('allow-nether') && (
                <SettingRow
                  label="Allow Nether Dimension"
                  propKey="allow-nether"
                  desc="Enable obsidian portals and Nether world generation."
                >
                  <ToggleSwitch
                    checked={getBoolProp('allow-nether', true)}
                    onChange={() => toggleBoolProp('allow-nether', true)}
                  />
                </SettingRow>
              )}

              {matchesKey('spawn-protection') && (
                <SettingRow
                  label="Spawn Protection Radius"
                  propKey="spawn-protection"
                  desc="Protected block radius around world spawn (0 to disable)."
                >
                  <Stepper
                    value={getProp('spawn-protection', '16')}
                    onChange={(val) => updateProp('spawn-protection', val, true)}
                    min={0}
                    max={500}
                    unit="blks"
                  />
                </SettingRow>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD 4: World Entities & Spawning */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('world') && (
            <div className="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-2 transition-all">
              <div className="flex items-center space-x-3 pb-3 mb-2 border-b border-neutral-800/80">
                <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-inner">
                  <FontAwesomeIcon icon={faGlobe} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">World & Spawning</h3>
                  <p className="text-[11px] text-neutral-400">Mob generation, chunk loading, and render distances</p>
                </div>
              </div>

              {matchesKey('spawn-monsters') && (
                <SettingRow
                  label="Spawn Monsters"
                  propKey="spawn-monsters"
                  desc="Allow hostile mobs to spawn (zombies, skeletons, creepers)."
                >
                  <ToggleSwitch
                    checked={getBoolProp('spawn-monsters', true)}
                    onChange={() => toggleBoolProp('spawn-monsters', true)}
                  />
                </SettingRow>
              )}

              {matchesKey('spawn-animals') && (
                <SettingRow
                  label="Spawn Passive Animals"
                  propKey="spawn-animals"
                  desc="Allow passive mobs to spawn (cows, pigs, sheep, chickens)."
                >
                  <ToggleSwitch
                    checked={getBoolProp('spawn-animals', true)}
                    onChange={() => toggleBoolProp('spawn-animals', true)}
                  />
                </SettingRow>
              )}

              {matchesKey('spawn-npcs') && (
                <SettingRow
                  label="Spawn Villagers & NPCs"
                  propKey="spawn-npcs"
                  desc="Allow villagers and wandering traders to spawn in worlds."
                >
                  <ToggleSwitch
                    checked={getBoolProp('spawn-npcs', true)}
                    onChange={() => toggleBoolProp('spawn-npcs', true)}
                  />
                </SettingRow>
              )}

              {matchesKey('view-distance') && (
                <SettingRow
                  label="View Distance"
                  propKey="view-distance"
                  desc="Chunk render radius sent to clients (2 - 32 chunks)."
                >
                  <Stepper
                    value={getProp('view-distance', '10')}
                    onChange={(val) => updateProp('view-distance', val, true)}
                    min={2}
                    max={32}
                    unit="chk"
                  />
                </SettingRow>
              )}

              {matchesKey('simulation-distance') && (
                <SettingRow
                  label="Simulation Distance"
                  propKey="simulation-distance"
                  desc="Radius of chunks around players where active block ticks run."
                >
                  <Stepper
                    value={getProp('simulation-distance', '10')}
                    onChange={(val) => updateProp('simulation-distance', val, true)}
                    min={2}
                    max={32}
                    unit="chk"
                  />
                </SettingRow>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD: Bedrock Dedicated Server Settings (When BDS detected) */}
          {/* ------------------------------------------------------------- */}
          {isBedrock && isCategoryVisible('bedrock') && (
            <div className="bg-neutral-900/70 border border-amber-600/40 hover:border-amber-500/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-2 transition-all">
              <div className="flex items-center space-x-3 pb-3 mb-2 border-b border-neutral-800/80">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
                  <FontAwesomeIcon icon={faGamepad} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Bedrock Dedicated Server</h3>
                  <p className="text-[11px] text-neutral-400">Native Bedrock BDS properties & player permissions</p>
                </div>
              </div>

              {matchesKey('allow-cheats') && (
                <SettingRow
                  label="Allow In-Game Cheats"
                  propKey="allow-cheats"
                  desc="Enables commands like /gamemode and /give for Bedrock players."
                >
                  <ToggleSwitch
                    checked={getBoolProp('allow-cheats', false)}
                    onChange={() => toggleBoolProp('allow-cheats', false)}
                    activeColor="amber"
                  />
                </SettingRow>
              )}

              {matchesKey('tick-distance') && (
                <SettingRow
                  label="Tick Distance (Bedrock)"
                  propKey="tick-distance"
                  desc="World tick radius in chunks around players (4 - 12)."
                >
                  <Stepper
                    value={getProp('tick-distance', '4')}
                    onChange={(val) => updateProp('tick-distance', val, true)}
                    min={4}
                    max={12}
                    unit="chk"
                  />
                </SettingRow>
              )}

              {matchesKey('default-player-permission-level') && (
                <SettingRow
                  label="Default Permission Tier"
                  propKey="default-player-permission-level"
                  desc="Permission level granted to newly connected Bedrock players."
                >
                  <select
                    value={getProp('default-player-permission-level', 'member').toLowerCase()}
                    onChange={(e) => updateProp('default-player-permission-level', e.target.value, true)}
                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700 focus:border-amber-500 rounded-xl px-3 py-1.5 text-xs text-neutral-200 font-medium cursor-pointer focus:outline-none transition-colors"
                  >
                    <option value="visitor">Visitor (Can only observe)</option>
                    <option value="member">Member (Regular player)</option>
                    <option value="operator">Operator (Full admin)</option>
                  </select>
                </SettingRow>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD: Advanced Performance & Network (When Java) */}
          {/* ------------------------------------------------------------- */}
          {!isBedrock && !isProxy && isCategoryVisible('advanced') && (
            <div className="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700/60 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-2 transition-all">
              <div className="flex items-center space-x-3 pb-3 mb-2 border-b border-neutral-800/80">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-inner">
                  <FontAwesomeIcon icon={faSlidersH} className="text-sm" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">Performance & Network</h3>
                  <p className="text-[11px] text-neutral-400">Low-level lag reduction, packet thresholds, and disk writing</p>
                </div>
              </div>

              {matchesKey('entity-broadcast-range-percentage') && (
                <SettingRow
                  label="Entity Broadcast Range %"
                  propKey="entity-broadcast-range-percentage"
                  desc="Lower values reduce bandwidth & entity render lag (50 - 200%)."
                >
                  <Stepper
                    value={getProp('entity-broadcast-range-percentage', '100')}
                    onChange={(val) => updateProp('entity-broadcast-range-percentage', val, true)}
                    min={10}
                    max={500}
                    step={10}
                    unit="%"
                  />
                </SettingRow>
              )}

              {matchesKey('network-compression-threshold') && (
                <SettingRow
                  label="Network Compression Threshold"
                  propKey="network-compression-threshold"
                  desc="Packet size before compression kicks in (-1 disables)."
                >
                  <Stepper
                    value={getProp('network-compression-threshold', '256')}
                    onChange={(val) => updateProp('network-compression-threshold', val, true)}
                    min={-1}
                    max={2048}
                    step={64}
                    unit="B"
                  />
                </SettingRow>
              )}

              {matchesKey('max-tick-time') && (
                <SettingRow
                  label="Watchdog Max Tick Time"
                  propKey="max-tick-time"
                  desc="Maximum ms a tick can take before watchdog crash halts (-1 disables)."
                >
                  <Stepper
                    value={getProp('max-tick-time', '60000')}
                    onChange={(val) => updateProp('max-tick-time', val, true)}
                    min={-1}
                    max={600000}
                    step={10000}
                    unit="ms"
                  />
                </SettingRow>
              )}

              {matchesKey('sync-chunk-writes') && (
                <SettingRow
                  label="Synchronous Chunk Writes"
                  propKey="sync-chunk-writes"
                  desc="Write chunks synchronously to disk to prevent world file corruption."
                >
                  <ToggleSwitch
                    checked={getBoolProp('sync-chunk-writes', true)}
                    onChange={() => toggleBoolProp('sync-chunk-writes', true)}
                  />
                </SettingRow>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* CARD 5: Resource Pack Settings & 1-Click ZIP Upload */}
        {/* ------------------------------------------------------------- */}
        {isCategoryVisible('resourcepack') && (
          <div className="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700/60 rounded-2xl p-5 sm:p-6 shadow-xl backdrop-blur-sm space-y-4 transition-all">
            <div className="flex items-center space-x-3 pb-3 border-b border-neutral-800/80">
              <div className="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shadow-inner">
                <FontAwesomeIcon icon={faCloudUploadAlt} className="text-sm" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-wide">Server Resource Pack</h3>
                <p className="text-[11px] text-neutral-400">Upload a .zip pack directly or link an external download URL</p>
              </div>
            </div>

            {/* 1-Click ZIP Upload Dropzone Area */}
            <div
              onClick={() => !uploadingPack && packInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700/80 hover:border-cyan-500/80 bg-neutral-950/60 hover:bg-neutral-900/60 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group relative"
            >
              {uploadingPack ? (
                <div className="flex flex-col items-center space-y-2 text-cyan-400 py-3">
                  <FontAwesomeIcon icon={faSpinner} spin className="text-3xl" />
                  <span className="text-sm font-semibold">Uploading & calculating SHA-1 checksum...</span>
                  <span className="text-xs text-neutral-400">Configuring server.properties automatically</span>
                </div>
              ) : getProp('resource-pack') ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                      <FontAwesomeIcon icon={faFileArchive} className="text-xl" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-white">Active Server Resource Pack</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-semibold">
                          HOSTED & LINKED
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 font-mono truncate max-w-md mt-0.5">
                        {getProp('resource-pack')}
                      </p>
                      {getProp('resource-pack-sha1') && (
                        <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                          SHA-1: <span className="text-neutral-300">{getProp('resource-pack-sha1')}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => packInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                    >
                      Replace .zip
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePack}
                      disabled={deletingPack}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/60 transition-colors"
                    >
                      {deletingPack ? (
                        <FontAwesomeIcon icon={faSpinner} spin />
                      ) : (
                        <>
                          <FontAwesomeIcon icon={faTrashAlt} className="mr-1.5" />
                          Remove
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-2.5 py-3">
                  <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700 group-hover:border-cyan-500/50 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                    <FontAwesomeIcon icon={faCloudUploadAlt} className="text-xl" />
                  </div>
                  <div className="text-sm font-bold text-neutral-200 group-hover:text-cyan-300 transition-colors">
                    Upload Server Resource Pack (.zip)
                  </div>
                  <p className="text-xs text-neutral-400 max-w-md">
                    Click to select your server resource pack. It will automatically be hosted securely on your panel and written to server.properties with automatic SHA-1 generation!
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs font-bold text-neutral-300">Resource Pack Direct URL (.zip)</label>
                <input
                  type="text"
                  value={getProp('resource-pack', '')}
                  onChange={(e) => updateProp('resource-pack', e.target.value, false)}
                  onBlur={(e) => updateProp('resource-pack', e.target.value, true)}
                  placeholder="https://example.com/pack.zip"
                  className="mt-1 w-full bg-neutral-950 border border-neutral-700/80 rounded-xl px-3.5 py-2 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300">Prompt Message (Optional)</label>
                <input
                  type="text"
                  value={getProp('resource-pack-prompt', '')}
                  onChange={(e) => updateProp('resource-pack-prompt', e.target.value, false)}
                  onBlur={(e) => updateProp('resource-pack-prompt', e.target.value, true)}
                  placeholder="Custom message shown to players when prompting..."
                  className="mt-1 w-full bg-neutral-950 border border-neutral-700/80 rounded-xl px-3.5 py-2 text-sm text-neutral-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <SettingRow
              label="Require Resource Pack"
              propKey="require-resource-pack"
              desc="Automatically disconnect players who decline the server resource pack prompt."
            >
              <ToggleSwitch
                checked={getBoolProp('require-resource-pack', false)}
                onChange={() => toggleBoolProp('require-resource-pack', false)}
              />
            </SettingRow>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
