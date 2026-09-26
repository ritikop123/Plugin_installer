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
  faExternalLinkAlt,
  faCheckCircle,
  faSearch,
  faTimes,
  faSlidersH,
  faUndo,
  faLayerGroup,
  faMagic,
  faInfoCircle,
  faServer,
  faTerminal,
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

type TabType = 'all' | 'general' | 'security' | 'gameplay' | 'world' | 'resourcepack' | 'advanced' | 'bedrock';

export default function OptionsContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
  const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

  // Core State
  const [loading, setLoading] = useState<boolean>(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasChangedInSession, setHasChangedInSession] = useState<boolean>(false);
  const [uploadingIcon, setUploadingIcon] = useState<boolean>(false);
  const [deletingIcon, setDeletingIcon] = useState<boolean>(false);
  const [uploadingPack, setUploadingPack] = useState<boolean>(false);
  const [deletingPack, setDeletingPack] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  // Server Info & Properties
  const [software, setSoftware] = useState<ServerSoftwareInfo | null>(null);
  const [serverAddress, setServerAddress] = useState<string>('');
  const [hasCustomIcon, setHasCustomIcon] = useState<boolean>(false);
  const [iconData, setIconData] = useState<string | null>(null);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [expireAt, setExpireAt] = useState<string | null>(null);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);

  // UI Interactivity & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [copiedMotd, setCopiedMotd] = useState<boolean>(false);
  const [motdPrefix, setMotdPrefix] = useState<'§' | '&'>('§');
  const [showMotdTools, setShowMotdTools] = useState<boolean>(false);

  // Refs for debounced auto-save & inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const packInputRef = useRef<HTMLInputElement>(null);
  const motdTextareaRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestPropsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    latestPropsRef.current = properties;
  }, [properties]);

  // Trigger Debounced Auto-Save
  const triggerAutoSave = useCallback(
    (propsToSave: Record<string, string>, immediate: boolean = false) => {
      setAutoSaveStatus('saving');
      setHasChangedInSession(true);
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      const runSave = async () => {
        try {
          await http.post(`/api/client/servers/${uuid}/options`, {
            properties: propsToSave,
          });
          setAutoSaveStatus('saved');
          setTimeout(() => {
            setAutoSaveStatus((current) => (current === 'saved' ? 'idle' : current));
          }, 2500);
        } catch (err) {
          console.error(err);
          setAutoSaveStatus('error');
        }
      };

      if (immediate) {
        runSave();
      } else {
        autoSaveTimerRef.current = setTimeout(runSave, 450);
      }
    },
    [uuid]
  );

  // Fetch initial server options and properties
  const loadOptions = useCallback(async () => {
    setLoading(true);
    setToastError(null);
    try {
      const res = await http.get<OptionsApiResponse>(`/api/client/servers/${uuid}/options`);
      if (res.data.success) {
        if (res.data.software) setSoftware(res.data.software);
        setServerAddress(res.data.address || '');
        setHasCustomIcon(!!res.data.has_custom_icon);
        setIconData(res.data.icon_data || DEFAULT_MC_ICON);
        setExpireAt(res.data.expire_at || null);
        setIsSuspended(!!res.data.is_suspended);
        const loadedProps = res.data.properties || {};
        if (!loadedProps.motd && !loadedProps['server-name']) {
          loadedProps.motd = res.data.default_motd || DEFAULT_MOTD;
        }
        setProperties(loadedProps);
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

  // Property helper functions
  const getProp = (key: string, fallback: string = ''): string => {
    return properties[key] !== undefined ? properties[key] : fallback;
  };

  const getBoolProp = (key: string, fallback: boolean = false): boolean => {
    const val = properties[key];
    if (val === undefined) return fallback;
    return val.toLowerCase() === 'true';
  };

  // Immediate update with auto-save
  const updateProp = (key: string, value: string, immediate: boolean = false) => {
    setProperties((prev) => {
      const next = { ...prev, [key]: value };
      // Sync Bedrock server-name with motd if bedrock
      if (key === 'motd' && software?.category === 'bedrock') {
        next['server-name'] = value;
      }
      triggerAutoSave(next, immediate);
      return next;
    });
  };

  const toggleBoolProp = (key: string, fallback: boolean = false) => {
    const current = getBoolProp(key, fallback);
    updateProp(key, (!current).toString(), true);
  };

  const resetToDefault = (key: string) => {
    const def = DEFAULT_VALUES[key];
    if (def !== undefined) {
      updateProp(key, def, true);
    }
  };

  // Copy Address Handler
  const handleCopyAddress = () => {
    if (!serverAddress) return;
    navigator.clipboard.writeText(serverAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  // Copy Raw MOTD Handler
  const handleCopyMotd = () => {
    const raw = getProp('motd', DEFAULT_MOTD);
    navigator.clipboard.writeText(raw);
    setCopiedMotd(true);
    setTimeout(() => setCopiedMotd(false), 2000);
  };

  // Insert MOTD formatting code at cursor
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

  // Apply MOTD Preset
  const handleApplyMotdPreset = (presetVal: string) => {
    updateProp('motd', presetVal, true);
  };

  // Icon File Upload Handler with Client-Side 64x64 Canvas Resizing
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

  // Delete Custom Icon -> Reverts to Sagarmatha Default 64x64 Logo
  const handleDeleteIcon = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Revert server icon to default Sagarmatha Hosting logo?')) {
      return;
    }

    setDeletingIcon(true);
    setToastError(null);
    setToastMessage(null);
    try {
      const res = await http.delete(`/api/client/servers/${uuid}/options/icon`);
      if (res.data.success) {
        setIconData(res.data.icon_data || DEFAULT_MC_ICON);
        setHasCustomIcon(false);
        setToastMessage('Server icon reverted to default Sagarmatha Hosting logo.');
        setTimeout(() => setToastMessage(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setDeletingIcon(false);
    }
  };

  // Resource Pack (.zip) Upload Handler
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
        setTimeout(() => setToastMessage(null), 6000);
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setUploadingPack(false);
    }
  };

  // Remove Uploaded Resource Pack
  const handleDeletePack = async () => {
    if (!confirm('Remove the uploaded resource pack from server.properties?')) {
      return;
    }

    setDeletingPack(true);
    setToastError(null);
    setToastMessage(null);
    try {
      const res = await http.delete(`/api/client/servers/${uuid}/options/resourcepack`);
      if (res.data.success) {
        setProperties((prev) => ({
          ...prev,
          'resource-pack': '',
          'resource-pack-sha1': '',
        }));
        setToastMessage('Resource pack removed from server.properties.');
        setTimeout(() => setToastMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setToastError(httpErrorToHuman(err));
    } finally {
      setDeletingPack(false);
    }
  };

  // Settings Definitions for Search & Categorization
  const isBedrock = software?.category === 'bedrock';
  const isProxy = software?.category === 'proxy';

  const settingsList = useMemo(() => {
    return [
      // General
      {
        key: 'max-players',
        label: isBedrock ? 'Max Players (Bedrock)' : isProxy ? 'Max Player Slots (Proxy)' : 'Max Players (Slots)',
        category: 'general',
        tags: ['slots', 'limit', 'players', 'capacity', 'size'],
        desc: 'Maximum simultaneous players allowed on the server.',
      },
      {
        key: 'gamemode',
        label: 'Default Gamemode',
        category: 'general',
        tags: ['mode', 'survival', 'creative', 'adventure', 'spectator'],
        desc: 'Default gamemode assigned to new players joining the world.',
      },
      {
        key: 'difficulty',
        label: 'Difficulty',
        category: 'general',
        tags: ['peaceful', 'easy', 'normal', 'hard', 'damage', 'mobs'],
        desc: 'Hostility and damage scale for mobs and survival hazards.',
      },
      {
        key: 'hardcore',
        label: 'Hardcore Mode',
        category: 'general',
        tags: ['death', 'ban', 'permadeath', 'hardcore', 'punishment'],
        desc: 'Players are permanently banned upon in-game death.',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'force-gamemode',
        label: 'Force Gamemode',
        category: 'general',
        tags: ['override', 'gamemode', 'strict'],
        desc: 'Forces existing players to revert to the default gamemode upon rejoining.',
        hidden: isBedrock || isProxy,
      },

      // Access & Security
      {
        key: 'online-mode',
        label: isBedrock ? 'Xbox Live Authentication' : 'Cracked / Offline Mode',
        category: 'security',
        tags: ['cracked', 'offline', 'auth', 'mojang', 'microsoft', 'xbox', 'login'],
        desc: isBedrock
          ? 'Require players to authenticate with an Xbox Live account.'
          : 'Toggle official Mojang authentication. Turn OFF to allow cracked / offline launchers.',
      },
      {
        key: 'white-list',
        label: 'Whitelist',
        category: 'security',
        tags: ['whitelist', 'access', 'private', 'allowlist', 'permission'],
        desc: 'Only players listed in the whitelist file can join the server.',
      },
      {
        key: 'enforce-whitelist',
        label: 'Enforce Whitelist',
        category: 'security',
        tags: ['kick', 'whitelist', 'strict'],
        desc: 'Instantly kick currently connected players if removed from the whitelist.',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'prevent-proxy-connections',
        label: 'Block VPN & Proxy Logins',
        category: 'security',
        tags: ['vpn', 'proxy', 'security', 'anti-bot', 'shield'],
        desc: 'Block connections originating from known VPN or commercial proxy services.',
        hidden: isBedrock || isProxy,
      },

      // Gameplay & Rules
      {
        key: 'pvp',
        label: 'Player vs Player (PvP)',
        category: 'gameplay',
        tags: ['pvp', 'combat', 'attack', 'friendly-fire', 'damage'],
        desc: 'Allow players to damage, fight, and engage each other in combat.',
        hidden: isProxy,
      },
      {
        key: 'allow-flight',
        label: 'Allow Flight',
        category: 'gameplay',
        tags: ['fly', 'flight', 'elytra', 'mods', 'kick'],
        desc: 'Prevent survival players from being kicked for flying with mods or abilities.',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'enable-command-block',
        label: 'Command Blocks',
        category: 'gameplay',
        tags: ['commands', 'scripts', 'automation', 'redstone'],
        desc: 'Enable command block execution across the world.',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'allow-nether',
        label: 'Allow Nether Dimension',
        category: 'gameplay',
        tags: ['nether', 'dimension', 'portal', 'hell'],
        desc: 'Enable portal access and chunk generation for the Nether dimension.',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'spawn-protection',
        label: 'Spawn Protection Radius',
        category: 'gameplay',
        tags: ['spawn', 'radius', 'protection', 'safezone'],
        desc: 'Protected block radius around world spawn where non-ops cannot build (0 to disable).',
        hidden: isProxy,
      },

      // World & Spawning
      {
        key: 'spawn-monsters',
        label: 'Spawn Monsters',
        category: 'world',
        tags: ['hostile', 'zombie', 'skeleton', 'creeper', 'mobs'],
        desc: 'Allow hostile monsters to spawn naturally.',
        hidden: isProxy,
      },
      {
        key: 'spawn-animals',
        label: 'Spawn Animals',
        category: 'world',
        tags: ['passive', 'cow', 'pig', 'sheep', 'chicken', 'wildlife'],
        desc: 'Allow passive wildlife and farm animals to spawn naturally.',
        hidden: isProxy,
      },
      {
        key: 'spawn-npcs',
        label: 'Spawn Villagers & NPCs',
        category: 'world',
        tags: ['villager', 'npc', 'trader', 'village'],
        desc: 'Allow villagers and wandering traders to spawn.',
        hidden: isProxy,
      },
      {
        key: 'view-distance',
        label: 'View Distance',
        category: 'world',
        tags: ['render', 'chunks', 'distance', 'view', 'radius'],
        desc: 'World chunk render radius sent to connected players (2 - 32 chunks).',
        hidden: isProxy,
      },
      {
        key: 'simulation-distance',
        label: 'Simulation Distance',
        category: 'world',
        tags: ['tick', 'simulation', 'distance', 'performance', 'chunks'],
        desc: 'Chunk radius around players where active block ticks, crops, and entities run.',
        hidden: isBedrock || isProxy,
      },

      // Bedrock-specific additions
      {
        key: 'allow-cheats',
        label: 'Allow In-Game Cheats',
        category: 'bedrock',
        tags: ['cheats', 'commands', 'bedrock', 'permissions'],
        desc: 'Allow commands like /gamemode and /give for Bedrock players.',
        hidden: !isBedrock,
      },
      {
        key: 'tick-distance',
        label: 'Tick Distance (Bedrock)',
        category: 'bedrock',
        tags: ['tick', 'distance', 'bedrock', 'chunks'],
        desc: 'World tick radius in chunks around players (default 4).',
        hidden: !isBedrock,
      },
      {
        key: 'player-idle-timeout',
        label: 'Idle Timeout (Minutes)',
        category: 'bedrock',
        tags: ['afk', 'idle', 'timeout', 'kick'],
        desc: 'Minutes of inactivity before an idle player is disconnected (0 = disabled).',
        hidden: !isBedrock,
      },
      {
        key: 'default-player-permission-level',
        label: 'Default Permission Level',
        category: 'bedrock',
        tags: ['permission', 'role', 'visitor', 'member', 'operator'],
        desc: 'Permission tier for newly joined Bedrock players.',
        hidden: !isBedrock,
      },

      // Advanced & Performance (Java)
      {
        key: 'entity-broadcast-range-percentage',
        label: 'Entity Broadcast Range %',
        category: 'advanced',
        tags: ['entities', 'broadcast', 'lag', 'render', 'performance'],
        desc: 'Percentage of default distance at which entities are sent to clients (50 - 200%).',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'network-compression-threshold',
        label: 'Network Compression Threshold',
        category: 'advanced',
        tags: ['compression', 'packets', 'bandwidth', 'network'],
        desc: 'Packet size threshold (in bytes) before compression kicks in (default 256).',
        hidden: isProxy,
      },
      {
        key: 'max-tick-time',
        label: 'Watchdog Max Tick Time',
        category: 'advanced',
        tags: ['watchdog', 'crash', 'freeze', 'hang', 'tick'],
        desc: 'Maximum milliseconds a single tick can take before watchdog halts server (-1 to disable).',
        hidden: isBedrock || isProxy,
      },
      {
        key: 'sync-chunk-writes',
        label: 'Sync Chunk Writes',
        category: 'advanced',
        tags: ['disk', 'chunks', 'saving', 'io'],
        desc: 'Synchronous chunk saving to disk. Disable to speed up heavy world saves.',
        hidden: isBedrock || isProxy,
      },

      // Resource Pack (Tab handled separately, but searchable)
      {
        key: 'resource-pack',
        label: 'Resource Pack URL',
        category: 'resourcepack',
        tags: ['pack', 'texture', 'texturepack', 'zip', 'download'],
        desc: 'Direct URL or hosted .zip resource pack downloaded by players.',
      },
      {
        key: 'require-resource-pack',
        label: 'Require Resource Pack',
        category: 'resourcepack',
        tags: ['enforce', 'pack', 'kick', 'decline'],
        desc: 'Automatically disconnect players who decline the server resource pack prompt.',
      },
    ].filter((item) => !item.hidden);
  }, [isBedrock, isProxy]);

  // Tab filtering & Counts
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
      if (counts[s.category] !== undefined) {
        counts[s.category]++;
      }
    });
    return counts;
  }, [settingsList]);

  // Filtered settings according to search query and active tab
  const filteredSettings = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return settingsList.filter((item) => {
      // Tab check
      if (activeTab !== 'all' && item.category !== activeTab) {
        return false;
      }
      // Query check
      if (!query) return true;
      return (
        item.key.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query) ||
        item.desc.toLowerCase().includes(query) ||
        item.tags.some((t) => t.includes(query))
      );
    });
  }, [settingsList, activeTab, searchQuery]);

  const matchesKey = (key: string) => {
    return filteredSettings.some((item) => item.key === key);
  };

  const isCategoryVisible = (cat: string) => {
    if (activeTab !== 'all' && activeTab !== cat) return false;
    return filteredSettings.some((item) => item.category === cat);
  };

  if (loading) {
    return (
      <ServerContentBlock title="Server Options">
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <FontAwesomeIcon icon={faSpinner} spin className="text-cyan-400 text-4xl" />
          <p className="text-neutral-400 font-medium">Loading server configuration & properties...</p>
        </div>
      </ServerContentBlock>
    );
  }

  return (
    <ServerContentBlock title="Server Options">
      <div className="space-y-6 pb-12">
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
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 font-medium animate-pulse">
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
              <span className="text-emerald-400 font-semibold flex items-center space-x-1.5 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full animate-fade-in shadow-sm shadow-emerald-500/20">
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
          <div className="flex items-center space-x-3 bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl shadow-lg transition-all animate-fade-in">
            <FontAwesomeIcon icon={faCheck} className="text-emerald-400 text-lg flex-shrink-0" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        )}

        {toastError && (
          <div className="flex items-center space-x-3 bg-red-950/70 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-lg transition-all animate-fade-in">
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
              <div className="flex items-center space-x-3 bg-red-950/80 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-lg transition-all animate-fade-in">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 text-lg flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">Server Suspended:</span> This server has been suspended due to reaching its expiration date. Please contact support or renew your plan to reactivate it.
                </div>
              </div>
            );
          }

          if (isExpiringSoon) {
            return (
              <div className="flex items-center space-x-3 bg-amber-950/80 border border-amber-500/50 text-amber-200 px-4 py-3 rounded-xl shadow-lg transition-all animate-fade-in">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-400 text-lg flex-shrink-0" />
                <div className="text-xs sm:text-sm">
                  <span className="font-bold text-white">Scheduled Suspension Notice:</span> This server is scheduled for automatic suspension on{' '}
                  <span className="font-mono text-cyan-300 font-semibold">
                    {new Date(expireAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>{' '}
                  {daysLeft === 0 ? '(Today)' : `(in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'})`}. Please renew your service to prevent downtime.
                </div>
              </div>
            );
          }

          return null;
        })()}

        {/* ========================================================================= */}
        {/* TOP SECTION: Authentic Minecraft Multiplayer Server Banner */}
        {/* ========================================================================= */}
        <div className="bg-neutral-900/90 border border-neutral-700/80 rounded-2xl p-5 sm:p-6 shadow-2xl backdrop-blur-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/15 transition-all" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
            {/* Left: 64x64 Icon Box & Server Address */}
            <div className="flex items-center space-x-4">
              {/* 64x64 Minecraft Server Icon Box */}
              <div
                onClick={() => !uploadingIcon && fileInputRef.current?.click()}
                className="relative group/icon cursor-pointer w-16 h-16 rounded-xl border-2 border-neutral-700 hover:border-cyan-500 transition-all duration-200 bg-black/60 overflow-hidden flex-shrink-0 shadow-lg"
                title="Click to change server icon (64×64 PNG, auto-resized)"
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

                {/* Remove Icon Button (only if custom icon active) */}
                {hasCustomIcon && !uploadingIcon && (
                  <button
                    type="button"
                    onClick={handleDeleteIcon}
                    className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow transition-colors z-20"
                    title="Revert to default Sagarmatha Hosting logo"
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

                {/* Unchangeable Server Address with Copy Button */}
                <div className="flex items-center space-x-2 mt-1.5">
                  <div
                    className="inline-flex items-center space-x-2 bg-neutral-800/90 border border-neutral-700/80 px-2.5 py-1 rounded-lg text-xs font-mono text-cyan-300 select-all cursor-pointer hover:border-cyan-500/60 transition-colors"
                    onClick={handleCopyAddress}
                    title="Click to copy server address"
                  >
                    <FontAwesomeIcon icon={faLock} className="text-neutral-400 text-[10px]" title="Read-only allocation address" />
                    <span>{serverAddress || 'Allocating port...'}</span>
                    <FontAwesomeIcon
                      icon={copiedAddress ? faCheck : faCopy}
                      className={copiedAddress ? 'text-emerald-400' : 'text-neutral-400 hover:text-cyan-400'}
                    />
                  </div>
                  {copiedAddress && (
                    <span className="text-xs text-emerald-400 font-medium transition-all">Copied!</span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: MOTD Action Buttons */}
            <div className="flex items-center space-x-2 self-end md:self-center">
              <button
                type="button"
                onClick={handleCopyMotd}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                title="Copy raw formatted MOTD code to clipboard"
              >
                <FontAwesomeIcon icon={copiedMotd ? faCheck : faCopy} className={copiedMotd ? 'text-emerald-400' : ''} />
                <span>{copiedMotd ? 'Copied MOTD' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowMotdTools(!showMotdTools)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  showMotdTools
                    ? 'bg-cyan-500 text-neutral-900 shadow-md shadow-cyan-500/30'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-500/30'
                }`}
              >
                <FontAwesomeIcon icon={faPalette} />
                <span>{showMotdTools ? 'Close Editor' : 'Visual MOTD Studio'}</span>
              </button>
            </div>
          </div>

          {/* In-Game MOTD Preview Box */}
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <FontAwesomeIcon icon={faSignal} className="text-emerald-400 text-[10px]" />
                <span>Multiplayer Server List Preview</span>
              </span>
              <div className="flex items-center space-x-3 text-[11px] text-neutral-400">
                <span>
                  Ping: <span className="text-emerald-400 font-mono font-bold">24ms</span>
                </span>
                <span>
                  Slots: <span className="text-white font-mono font-bold">{getProp('max-players', '20')}</span>
                </span>
              </div>
            </div>
            <div className="bg-black/90 border border-neutral-700/80 rounded-xl p-4 min-h-[58px] flex items-center font-mono text-sm leading-relaxed tracking-wide shadow-inner overflow-x-auto select-none">
              <div className="w-full">
                {renderMotdSpans(getProp('motd', DEFAULT_MOTD))}
              </div>
            </div>
          </div>

          {/* Expandable MOTD Editor Toolbar */}
          {showMotdTools && (
            <div className="mt-4 pt-4 border-t border-neutral-800 space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-neutral-300 flex items-center space-x-2">
                  <FontAwesomeIcon icon={faMagic} className="text-cyan-400" />
                  <span>Interactive MOTD Editor</span>
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
                    Reset to Default MOTD
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
                  className="w-full bg-neutral-950/90 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none resize-y"
                />
                <span className="absolute bottom-2 right-3 text-[10px] text-neutral-500 font-mono">
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
              <div className="flex flex-wrap items-center gap-3 pt-1">
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
              placeholder="Search settings by name, property, or keyword (e.g. pvp, flight, whitelist, distance)..."
              className="w-full bg-neutral-900/90 border border-neutral-700/80 rounded-xl pl-10 pr-10 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none transition-all shadow-inner"
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
              { id: 'security', label: 'Security & Access', icon: faShieldAlt, count: tabCounts.security },
              { id: 'gameplay', label: 'Gameplay & Rules', icon: faSkullCrossbones, count: tabCounts.gameplay },
              { id: 'world', label: 'World & Spawns', icon: faGlobe, count: tabCounts.world },
              ...(isBedrock ? [{ id: 'bedrock', label: 'Bedrock Dedicated', icon: faGamepad, count: tabCounts.bedrock }] : []),
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

        {/* ========================================================================= */}
        {/* EMPTY SEARCH STATE */}
        {/* ========================================================================= */}
        {filteredSettings.length === 0 && (
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700 mx-auto flex items-center justify-center text-neutral-400">
              <FontAwesomeIcon icon={faSearch} className="text-xl" />
            </div>
            <h4 className="text-base font-bold text-white">No Matching Settings Found</h4>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto">
              No configuration properties matched your search term &quot;{searchQuery}&quot;. Try adjusting your keywords or clearing the search filter.
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
        {/* MAIN CONFIGURATION GRID: server.properties Settings */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ------------------------------------------------------------- */}
          {/* CARD 1: General Server Settings */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('general') && (
            <div className="bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <FontAwesomeIcon icon={faGamepad} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">General Settings</h3>
                  <p className="text-xs text-neutral-400">Core player capacity and game modes</p>
                </div>
              </div>

              {/* Slots / Max Players Stepper */}
              {matchesKey('max-players') && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">
                        {isBedrock ? 'Max Players (Bedrock)' : isProxy ? 'Max Player Slots' : 'Max Players (Slots)'}
                      </label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 20)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Maximum simultaneous players allowed</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('max-players', '20'), 10) || 20;
                        if (current > 1) updateProp('max-players', (current - 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faMinus} className="text-xs" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={getProp('max-players', '20')}
                      onChange={(e) => updateProp('max-players', e.target.value, false)}
                      onBlur={(e) => updateProp('max-players', e.target.value, true)}
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('max-players', '20'), 10) || 20;
                        updateProp('max-players', (current + 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  </div>
                </div>
              )}

              {/* Default Gamemode Dropdown */}
              {matchesKey('gamemode') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Default Gamemode</label>
                    <p className="text-xs text-neutral-400">Gamemode for new players</p>
                  </div>
                  <select
                    value={getProp('gamemode', 'survival').toLowerCase()}
                    onChange={(e) => updateProp('gamemode', e.target.value, true)}
                    className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="survival">Survival</option>
                    <option value="creative">Creative</option>
                    <option value="adventure">Adventure</option>
                    <option value="spectator">Spectator</option>
                  </select>
                </div>
              )}

              {/* Difficulty Dropdown */}
              {matchesKey('difficulty') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Difficulty</label>
                    <p className="text-xs text-neutral-400">World hostility & damage scale</p>
                  </div>
                  <select
                    value={getProp('difficulty', 'easy').toLowerCase()}
                    onChange={(e) => updateProp('difficulty', e.target.value, true)}
                    className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="peaceful">Peaceful</option>
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              )}

              {/* Hardcore Toggle */}
              {matchesKey('hardcore') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Hardcore Mode</label>
                      {getBoolProp('hardcore', false) && (
                        <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold border border-red-500/30">
                          PERMADEATH
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400">Players are banned permanently upon death</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('hardcore', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('hardcore', false) ? 'bg-red-600' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('hardcore', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Force Gamemode Toggle */}
              {matchesKey('force-gamemode') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Force Gamemode</label>
                    <p className="text-xs text-neutral-400">Forces players to join in default gamemode</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('force-gamemode', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('force-gamemode', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('force-gamemode', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Server Expiration Status Row */}
              {expireAt && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Server Expiration</label>
                    <p className="text-xs text-neutral-400">Scheduled auto-suspension</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {new Date(expireAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <p className="text-[11px] text-neutral-400">
                      {(() => {
                        const expTime = new Date(expireAt).getTime();
                        const diffMs = expTime - Date.now();
                        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                        return days >= 0 ? `${days} days remaining` : 'Expired';
                      })()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD 2: Security & Player Access */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('security') && (
            <div className="bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <FontAwesomeIcon icon={faShieldAlt} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Access & Authentication</h3>
                  <p className="text-xs text-neutral-400">Control who can join your server</p>
                </div>
              </div>

              {/* Cracked / Offline Mode Toggle */}
              {matchesKey('online-mode') && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">
                        {isBedrock ? 'Xbox Live Login' : 'Cracked / Offline Mode'}
                      </label>
                      {!getBoolProp('online-mode', true) ? (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-medium border border-amber-500/30">
                          Cracked Allowed
                        </span>
                      ) : (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-medium border border-emerald-500/30">
                          Premium Only
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400">
                      {isBedrock
                        ? 'Require Xbox Live accounts for Bedrock clients'
                        : 'Allow players without an official Mojang/Microsoft account'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const isCracked = !getBoolProp('online-mode', true);
                      updateProp('online-mode', isCracked ? 'true' : 'false', true);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      !getBoolProp('online-mode', true) ? 'bg-amber-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        !getBoolProp('online-mode', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Whitelist Toggle */}
              {matchesKey('white-list') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Whitelist</label>
                      {getBoolProp('white-list', false) && (
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded font-medium border border-cyan-500/30">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400">Only players on the whitelist file can connect</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('white-list', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('white-list', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('white-list', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Enforce Whitelist Toggle */}
              {matchesKey('enforce-whitelist') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Enforce Whitelist</label>
                    <p className="text-xs text-neutral-400">Kick online players immediately when removed from whitelist</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('enforce-whitelist', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('enforce-whitelist', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('enforce-whitelist', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Prevent Proxy Connections Toggle */}
              {matchesKey('prevent-proxy-connections') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Block VPN & Proxy Logins</label>
                    <p className="text-xs text-neutral-400">Reject connections originating from known VPN or proxy networks</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('prevent-proxy-connections', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('prevent-proxy-connections', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('prevent-proxy-connections', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD 3: Gameplay & Combat */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('gameplay') && (
            <div className="bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                  <FontAwesomeIcon icon={faSkullCrossbones} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gameplay & Combat</h3>
                  <p className="text-xs text-neutral-400">Player interactions and command permissions</p>
                </div>
              </div>

              {/* PVP Toggle */}
              {matchesKey('pvp') && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Player vs Player (PvP)</label>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                          getBoolProp('pvp', true) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-neutral-800 text-neutral-400'
                        }`}
                      >
                        {getBoolProp('pvp', true) ? 'PVP ON' : 'PVP OFF'}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400">Allow players to damage and fight each other</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('pvp', true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('pvp', true) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('pvp', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Allow Flight Toggle */}
              {matchesKey('allow-flight') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Allow Flight</label>
                    <p className="text-xs text-neutral-400">Prevent kicking survival players when flying (mods/abilities)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('allow-flight', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('allow-flight', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('allow-flight', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Command Blocks Toggle */}
              {matchesKey('enable-command-block') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Command Blocks</label>
                    <p className="text-xs text-neutral-400">Allow command blocks to execute automated scripts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('enable-command-block', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('enable-command-block', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('enable-command-block', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Allow Nether Toggle */}
              {matchesKey('allow-nether') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Allow Nether Dimension</label>
                    <p className="text-xs text-neutral-400">Enable portals and Nether world generation</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('allow-nether', true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('allow-nether', true) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('allow-nether', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Spawn Protection Stepper */}
              {matchesKey('spawn-protection') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Spawn Protection Radius</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 16)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Protected block radius around world spawn (0 to disable)</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('spawn-protection', '16'), 10) || 0;
                        if (current > 0) updateProp('spawn-protection', (current - 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faMinus} className="text-xs" />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={getProp('spawn-protection', '16')}
                      onChange={(e) => updateProp('spawn-protection', e.target.value, false)}
                      onBlur={(e) => updateProp('spawn-protection', e.target.value, true)}
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('spawn-protection', '16'), 10) || 0;
                        updateProp('spawn-protection', (current + 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD 4: World Entities & Performance */}
          {/* ------------------------------------------------------------- */}
          {isCategoryVisible('world') && (
            <div className="bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <FontAwesomeIcon icon={faGlobe} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">World & Spawning</h3>
                  <p className="text-xs text-neutral-400">Mob generation and render distances</p>
                </div>
              </div>

              {/* Spawn Monsters Toggle */}
              {matchesKey('spawn-monsters') && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Spawn Monsters</label>
                    <p className="text-xs text-neutral-400">Allow hostile mobs to spawn (zombies, creepers, etc.)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('spawn-monsters', true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('spawn-monsters', true) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('spawn-monsters', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Spawn Animals Toggle */}
              {matchesKey('spawn-animals') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Spawn Animals</label>
                    <p className="text-xs text-neutral-400">Allow passive mobs to spawn (cows, pigs, sheep)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('spawn-animals', true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('spawn-animals', true) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('spawn-animals', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Spawn NPCs Toggle */}
              {matchesKey('spawn-npcs') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Spawn Villagers & NPCs</label>
                    <p className="text-xs text-neutral-400">Allow villagers and wandering traders to spawn</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('spawn-npcs', true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('spawn-npcs', true) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('spawn-npcs', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* View Distance Stepper */}
              {matchesKey('view-distance') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">View Distance</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 10)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Chunk render radius sent to clients (2 - 32 chunks)</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('view-distance', '10'), 10) || 10;
                        if (current > 2) updateProp('view-distance', (current - 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faMinus} className="text-xs" />
                    </button>
                    <input
                      type="number"
                      min={2}
                      max={32}
                      value={getProp('view-distance', '10')}
                      onChange={(e) => updateProp('view-distance', e.target.value, false)}
                      onBlur={(e) => updateProp('view-distance', e.target.value, true)}
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('view-distance', '10'), 10) || 10;
                        if (current < 32) updateProp('view-distance', (current + 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  </div>
                </div>
              )}

              {/* Simulation Distance Stepper */}
              {matchesKey('simulation-distance') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Simulation Distance</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 10)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Chunk radius where active block ticks run</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('simulation-distance', '10'), 10) || 10;
                        if (current > 2) updateProp('simulation-distance', (current - 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faMinus} className="text-xs" />
                    </button>
                    <input
                      type="number"
                      min={2}
                      max={32}
                      value={getProp('simulation-distance', '10')}
                      onChange={(e) => updateProp('simulation-distance', e.target.value, false)}
                      onBlur={(e) => updateProp('simulation-distance', e.target.value, true)}
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('simulation-distance', '10'), 10) || 10;
                        if (current < 32) updateProp('simulation-distance', (current + 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700 active:scale-95"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD: Bedrock Dedicated Server Settings (When BDS detected) */}
          {/* ------------------------------------------------------------- */}
          {isBedrock && isCategoryVisible('bedrock') && (
            <div className="bg-neutral-900/80 border border-amber-600/40 hover:border-amber-500/60 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <FontAwesomeIcon icon={faGamepad} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Bedrock Dedicated Server</h3>
                  <p className="text-xs text-neutral-400">Native Bedrock BDS properties & permissions</p>
                </div>
              </div>

              {/* Allow Cheats Toggle */}
              {matchesKey('allow-cheats') && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Allow In-Game Cheats</label>
                    <p className="text-xs text-neutral-400">Enables commands like /gamemode and /give for Bedrock players</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('allow-cheats', false)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('allow-cheats', false) ? 'bg-amber-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('allow-cheats', false) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}

              {/* Tick Distance Stepper */}
              {matchesKey('tick-distance') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Tick Distance (Bedrock)</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 4)</span>
                    </div>
                    <p className="text-xs text-neutral-400">World tick radius in chunks around players (4 - 12)</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('tick-distance', '4'), 10) || 4;
                        if (current > 4) updateProp('tick-distance', (current - 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700"
                    >
                      <FontAwesomeIcon icon={faMinus} className="text-xs" />
                    </button>
                    <input
                      type="number"
                      min={4}
                      max={12}
                      value={getProp('tick-distance', '4')}
                      onChange={(e) => updateProp('tick-distance', e.target.value, false)}
                      onBlur={(e) => updateProp('tick-distance', e.target.value, true)}
                      className="w-16 bg-neutral-950 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(getProp('tick-distance', '4'), 10) || 4;
                        if (current < 12) updateProp('tick-distance', (current + 1).toString(), true);
                      }}
                      className="w-8 h-8 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center justify-center transition-colors border border-neutral-700"
                    >
                      <FontAwesomeIcon icon={faPlus} className="text-xs" />
                    </button>
                  </div>
                </div>
              )}

              {/* Default Permission Level Dropdown */}
              {matchesKey('default-player-permission-level') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Default Permission Level</label>
                    <p className="text-xs text-neutral-400">Permissions tier for newly joined players</p>
                  </div>
                  <select
                    value={getProp('default-player-permission-level', 'member').toLowerCase()}
                    onChange={(e) => updateProp('default-player-permission-level', e.target.value, true)}
                    className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="visitor">Visitor (Can only look around)</option>
                    <option value="member">Member (Regular player)</option>
                    <option value="operator">Operator (Full admin)</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* CARD: Advanced Performance & Network (When Java & Filtered) */}
          {/* ------------------------------------------------------------- */}
          {!isBedrock && !isProxy && isCategoryVisible('advanced') && (
            <div className="bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition-all">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <FontAwesomeIcon icon={faSlidersH} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Performance & Network</h3>
                  <p className="text-xs text-neutral-400">Low-level lag reduction and disk writing parameters</p>
                </div>
              </div>

              {/* Entity Broadcast Range % */}
              {matchesKey('entity-broadcast-range-percentage') && (
                <div className="flex items-center justify-between py-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Entity Broadcast Range %</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 100%)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Lower values reduce bandwidth & entity render lag (50 - 200%)</p>
                  </div>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    value={getProp('entity-broadcast-range-percentage', '100')}
                    onChange={(e) => updateProp('entity-broadcast-range-percentage', e.target.value, false)}
                    onBlur={(e) => updateProp('entity-broadcast-range-percentage', e.target.value, true)}
                    className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg py-1 px-2 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {/* Network Compression Threshold */}
              {matchesKey('network-compression-threshold') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Compression Threshold (Bytes)</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 256)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Packet size before gzip compression (-1 to disable)</p>
                  </div>
                  <input
                    type="number"
                    min={-1}
                    max={2048}
                    value={getProp('network-compression-threshold', '256')}
                    onChange={(e) => updateProp('network-compression-threshold', e.target.value, false)}
                    onBlur={(e) => updateProp('network-compression-threshold', e.target.value, true)}
                    className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg py-1 px-2 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {/* Watchdog Max Tick Time */}
              {matchesKey('max-tick-time') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <div className="flex items-center space-x-2">
                      <label className="text-sm font-semibold text-neutral-200">Watchdog Max Tick Time</label>
                      <span className="text-[10px] text-neutral-500 font-mono">(default: 60000ms)</span>
                    </div>
                    <p className="text-xs text-neutral-400">Maximum ms a tick can take before crash halt (-1 disables)</p>
                  </div>
                  <input
                    type="number"
                    min={-1}
                    max={600000}
                    value={getProp('max-tick-time', '60000')}
                    onChange={(e) => updateProp('max-tick-time', e.target.value, false)}
                    onBlur={(e) => updateProp('max-tick-time', e.target.value, true)}
                    className="w-24 bg-neutral-950 border border-neutral-700 rounded-lg py-1 px-2 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {/* Sync Chunk Writes Toggle */}
              {matchesKey('sync-chunk-writes') && (
                <div className="flex items-center justify-between py-2 border-t border-neutral-800/60">
                  <div>
                    <label className="text-sm font-semibold text-neutral-200">Synchronous Chunk Writes</label>
                    <p className="text-xs text-neutral-400">Write chunks synchronously to disk to prevent corruption</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleBoolProp('sync-chunk-writes', true)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      getBoolProp('sync-chunk-writes', true) ? 'bg-cyan-500' : 'bg-neutral-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        getBoolProp('sync-chunk-writes', true) ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------- */}
        {/* CARD 5: Resource Pack Settings & 1-Click ZIP Upload */}
        {/* ------------------------------------------------------------- */}
        {isCategoryVisible('resourcepack') && (
          <div className="bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700/80 rounded-2xl p-5 sm:p-6 shadow-lg space-y-4 transition-all">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-800">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
                <FontAwesomeIcon icon={faCloudUploadAlt} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Server Resource Pack</h3>
                <p className="text-xs text-neutral-400">Upload a .zip pack directly or link an external download URL</p>
              </div>
            </div>

            {/* 1-Click ZIP Upload Dropzone Area */}
            <div
              onClick={() => !uploadingPack && packInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-700/90 hover:border-cyan-500/80 bg-neutral-950/60 hover:bg-neutral-900/60 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group relative"
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
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                    >
                      Replace .zip
                    </button>
                    <button
                      type="button"
                      onClick={handleDeletePack}
                      disabled={deletingPack}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/60 transition-colors"
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
                  className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:outline-none"
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
                  className="mt-1 w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2 text-sm text-neutral-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Require Resource Pack</label>
                <p className="text-xs text-neutral-400">Disconnect players who decline to download the resource pack</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('require-resource-pack', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('require-resource-pack', false) ? 'bg-cyan-500' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('require-resource-pack', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
