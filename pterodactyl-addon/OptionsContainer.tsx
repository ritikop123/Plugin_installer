import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from '@fortawesome/free-solid-svg-icons';

interface OptionsApiResponse {
  success: boolean;
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
const DEFAULT_MC_ICON = 'data:image/png;base64,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';
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

export default function OptionsContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
  const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

  // Core State
  const [loading, setLoading] = useState<boolean>(true);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [uploadingIcon, setUploadingIcon] = useState<boolean>(false);
  const [deletingIcon, setDeletingIcon] = useState<boolean>(false);
  const [uploadingPack, setUploadingPack] = useState<boolean>(false);
  const [deletingPack, setDeletingPack] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  // Server Info & Properties
  const [serverAddress, setServerAddress] = useState<string>('');
  const [hasCustomIcon, setHasCustomIcon] = useState<boolean>(false);
  const [iconData, setIconData] = useState<string | null>(null);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [expireAt, setExpireAt] = useState<string | null>(null);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);

  // UI Interactivity
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
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
        setServerAddress(res.data.address || '');
        setHasCustomIcon(!!res.data.has_custom_icon);
        setIconData(res.data.icon_data || DEFAULT_MC_ICON);
        setExpireAt(res.data.expire_at || null);
        setIsSuspended(!!res.data.is_suspended);
        const loadedProps = res.data.properties || {};
        if (!loadedProps.motd) {
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
      triggerAutoSave(next, immediate);
      return next;
    });
  };

  const toggleBoolProp = (key: string, fallback: boolean = false) => {
    const current = getBoolProp(key, fallback);
    updateProp(key, (!current).toString(), true);
  };

  // Copy Address Handler
  const handleCopyAddress = () => {
    if (!serverAddress) return;
    navigator.clipboard.writeText(serverAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
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

        {/* Top Header Row with Subtle Auto-Save Status */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-neutral-400">
              Changes auto-save automatically. Restart server to apply.
            </span>
          </div>

          {/* Auto-Save Live Badge */}
          <div className="flex items-center space-x-1.5 text-xs font-mono">
            {autoSaveStatus === 'saving' && (
              <span className="text-cyan-400 flex items-center space-x-1">
                <FontAwesomeIcon icon={faSpinner} spin className="text-[11px]" />
                <span>Saving...</span>
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-emerald-400 font-semibold flex items-center space-x-1 animate-fade-in">
                <FontAwesomeIcon icon={faCheckCircle} className="text-[11px]" />
                <span>Saved</span>
              </span>
            )}
            {autoSaveStatus === 'error' && (
              <span className="text-red-400 font-semibold flex items-center space-x-1">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-[11px]" />
                <span>Save Error</span>
              </span>
            )}
            {autoSaveStatus === 'idle' && (
              <span className="text-neutral-400 flex items-center space-x-1">
                <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                <span>All changes saved</span>
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
        <div className="bg-neutral-900/90 border border-neutral-700/80 rounded-2xl p-5 shadow-2xl backdrop-blur-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
            {/* Left: 64x64 Icon Box & Server Address */}
            <div className="flex items-center space-x-4">
              {/* 64x64 Minecraft Server Icon Box */}
              <div
                onClick={() => !uploadingIcon && fileInputRef.current?.click()}
                className="relative group cursor-pointer w-16 h-16 rounded-xl border-2 border-neutral-700 hover:border-cyan-500 transition-all duration-200 bg-black/60 overflow-hidden flex-shrink-0 shadow-md"
                title="Click to change server icon (64×64 PNG)"
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
                <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
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
                <div className="flex items-center space-x-2.5">
                  <h2 className="text-lg font-bold text-white tracking-wide">{serverName}</h2>
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

            {/* Right: MOTD Toggle Button */}
            <div className="flex items-center space-x-3 self-end md:self-center">
              <button
                type="button"
                onClick={() => setShowMotdTools(!showMotdTools)}
                className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  showMotdTools
                    ? 'bg-cyan-500 text-neutral-900 shadow-md shadow-cyan-500/20'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                }`}
              >
                <FontAwesomeIcon icon={faPalette} />
                <span>{showMotdTools ? 'Hide MOTD Editor' : 'Edit MOTD'}</span>
              </button>
            </div>
          </div>

          {/* In-Game MOTD Preview Box */}
          <div className="mt-4 pt-4 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                Multiplayer List In-Game Preview
              </span>
              <span className="text-[11px] text-neutral-400">
                Slots: <span className="text-white font-mono">{getProp('max-players', '20')}</span>
              </span>
            </div>
            <div className="bg-black/90 border border-neutral-700/80 rounded-xl p-3.5 min-h-[52px] flex items-center font-mono text-sm leading-relaxed tracking-wide shadow-inner overflow-x-auto select-none">
              <div className="w-full">
                {renderMotdSpans(getProp('motd', DEFAULT_MOTD))}
              </div>
            </div>
          </div>

          {/* Expandable MOTD Editor Toolbar */}
          {showMotdTools && (
            <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-neutral-300 flex items-center space-x-2">
                  <span>Change MOTD Description</span>
                  <span className="text-neutral-400 font-normal text-[11px]">(Auto-saves as you type)</span>
                </label>

                {/* Prefix Selector */}
                <div className="flex items-center space-x-1.5 text-xs text-neutral-400">
                  <span>Prefix:</span>
                  <button
                    type="button"
                    onClick={() => setMotdPrefix('§')}
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      motdPrefix === '§' ? 'bg-cyan-500 text-neutral-900' : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    §
                  </button>
                  <button
                    type="button"
                    onClick={() => setMotdPrefix('&')}
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      motdPrefix === '&' ? 'bg-cyan-500 text-neutral-900' : 'bg-neutral-800 text-neutral-300'
                    }`}
                  >
                    &
                  </button>
                  <button
                    type="button"
                    onClick={() => updateProp('motd', DEFAULT_MOTD, true)}
                    className="ml-2 text-[11px] text-cyan-400 hover:text-cyan-300 underline"
                  >
                    Reset to Default MOTD
                  </button>
                </div>
              </div>

              {/* MOTD Input Textarea */}
              <textarea
                ref={motdTextareaRef}
                rows={2}
                value={getProp('motd', DEFAULT_MOTD)}
                onChange={(e) => updateProp('motd', e.target.value, false)}
                placeholder="Enter server description (MOTD)..."
                className="w-full bg-neutral-950/90 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none resize-y"
              />

              {/* Color Code Palette & Formatting Tools */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* 16 Colors */}
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

                {/* Formats */}
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
          )}
        </div>

        {/* ========================================================================= */}
        {/* MAIN CONFIGURATION GRID: server.properties Settings */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ------------------------------------------------------------- */}
          {/* CARD 1: General Server Settings */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-700/60">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <FontAwesomeIcon icon={faGamepad} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">General Settings</h3>
                <p className="text-xs text-neutral-400">Core player limits and game modes</p>
              </div>
            </div>

            {/* Slots / Max Players Stepper */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Max Players (Slots)</label>
                <p className="text-xs text-neutral-400">Maximum simultaneous players allowed</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('max-players', '20'), 10) || 20;
                    if (current > 1) updateProp('max-players', (current - 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
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
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('max-players', '20'), 10) || 20;
                    updateProp('max-players', (current + 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            </div>

            {/* Default Gamemode Dropdown */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Default Gamemode</label>
                <p className="text-xs text-neutral-400">Gamemode for new players</p>
              </div>
              <select
                value={getProp('gamemode', 'survival').toLowerCase()}
                onChange={(e) => updateProp('gamemode', e.target.value, true)}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="survival">Survival</option>
                <option value="creative">Creative</option>
                <option value="adventure">Adventure</option>
                <option value="spectator">Spectator</option>
              </select>
            </div>

            {/* Difficulty Dropdown */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Difficulty</label>
                <p className="text-xs text-neutral-400">World hostility & damage scale</p>
              </div>
              <select
                value={getProp('difficulty', 'easy').toLowerCase()}
                onChange={(e) => updateProp('difficulty', e.target.value, true)}
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-neutral-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="peaceful">Peaceful</option>
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Hardcore Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Hardcore Mode</label>
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

            {/* Force Gamemode Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Force Gamemode</label>
                <p className="text-xs text-neutral-400">Forces players to join in default gamemode</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('force-gamemode', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('force-gamemode', false) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('force-gamemode', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Server Expiration Status Row */}
            {expireAt && (
              <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
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

          {/* ------------------------------------------------------------- */}
          {/* CARD 2: Security & Player Access */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-700/60">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <FontAwesomeIcon icon={faShieldAlt} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Access & Authentication</h3>
                <p className="text-xs text-neutral-400">Control who can join your server</p>
              </div>
            </div>

            {/* Cracked / Offline Mode Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-semibold text-neutral-200">Cracked / Offline Mode</label>
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
                <p className="text-xs text-neutral-400">Allow players without an official Mojang/Microsoft account</p>
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

            {/* Whitelist Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Whitelist</label>
                <p className="text-xs text-neutral-400">Only players on the whitelist file can connect</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('white-list', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('white-list', false) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('white-list', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Enforce Whitelist Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Enforce Whitelist</label>
                <p className="text-xs text-neutral-400">Kick online players immediately when removed from whitelist</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('enforce-whitelist', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('enforce-whitelist', false) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('enforce-whitelist', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Prevent Proxy Connections Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Block VPN & Proxy Logins</label>
                <p className="text-xs text-neutral-400">Reject connections originating from known VPN or proxy networks</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('prevent-proxy-connections', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('prevent-proxy-connections', false) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('prevent-proxy-connections', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* CARD 3: Gameplay & Combat */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-700/60">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <FontAwesomeIcon icon={faSkullCrossbones} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Gameplay & Combat</h3>
                <p className="text-xs text-neutral-400">Player interactions and command permissions</p>
              </div>
            </div>

            {/* PVP Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Player vs Player (PvP)</label>
                <p className="text-xs text-neutral-400">Allow players to damage and fight each other</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('pvp', true)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('pvp', true) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('pvp', true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Allow Flight Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Allow Flight</label>
                <p className="text-xs text-neutral-400">Prevent kicking survival players when flying (mods/abilities)</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('allow-flight', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('allow-flight', false) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('allow-flight', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Command Blocks Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Command Blocks</label>
                <p className="text-xs text-neutral-400">Allow command blocks to execute automated scripts</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('enable-command-block', false)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('enable-command-block', false) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('enable-command-block', false) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Allow Nether Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Allow Nether Dimension</label>
                <p className="text-xs text-neutral-400">Enable portals and Nether world generation</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('allow-nether', true)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('allow-nether', true) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('allow-nether', true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Spawn Protection Stepper */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Spawn Protection Radius</label>
                <p className="text-xs text-neutral-400">Protected block radius around world spawn (0 to disable)</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('spawn-protection', '16'), 10) || 0;
                    if (current > 0) updateProp('spawn-protection', (current - 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
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
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('spawn-protection', '16'), 10) || 0;
                    updateProp('spawn-protection', (current + 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* CARD 4: World Entities & Performance */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-700/60">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <FontAwesomeIcon icon={faGlobe} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">World & Spawning</h3>
                <p className="text-xs text-neutral-400">Mob generation and render distances</p>
              </div>
            </div>

            {/* Spawn Monsters Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Spawn Monsters</label>
                <p className="text-xs text-neutral-400">Allow hostile mobs to spawn (zombies, creepers, etc.)</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('spawn-monsters', true)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('spawn-monsters', true) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('spawn-monsters', true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Spawn Animals Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Spawn Animals</label>
                <p className="text-xs text-neutral-400">Allow passive mobs to spawn (cows, pigs, sheep)</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('spawn-animals', true)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('spawn-animals', true) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('spawn-animals', true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Spawn NPCs Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Spawn Villagers & NPCs</label>
                <p className="text-xs text-neutral-400">Allow villagers and wandering traders to spawn</p>
              </div>
              <button
                type="button"
                onClick={() => toggleBoolProp('spawn-npcs', true)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  getBoolProp('spawn-npcs', true) ? 'bg-cyan-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    getBoolProp('spawn-npcs', true) ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* View Distance Stepper */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">View Distance</label>
                <p className="text-xs text-neutral-400">World chunk render radius sent to clients (chunks)</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('view-distance', '10'), 10) || 10;
                    if (current > 2) updateProp('view-distance', (current - 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
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
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('view-distance', '10'), 10) || 10;
                    if (current < 32) updateProp('view-distance', (current + 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            </div>

            {/* Simulation Distance Stepper */}
            <div className="flex items-center justify-between py-2 border-t border-neutral-700/40">
              <div>
                <label className="text-sm font-semibold text-neutral-200">Simulation Distance</label>
                <p className="text-xs text-neutral-400">Chunk radius around players where ticks & updates run</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('simulation-distance', '10'), 10) || 10;
                    if (current > 2) updateProp('simulation-distance', (current - 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
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
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('simulation-distance', '10'), 10) || 10;
                    if (current < 32) updateProp('simulation-distance', (current + 1).toString(), true);
                  }}
                  className="w-8 h-8 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 flex items-center justify-center transition-colors"
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* CARD 5: Resource Pack Settings & 1-Click ZIP Upload */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-700/60">
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
            className="border-2 border-dashed border-neutral-700 hover:border-cyan-500/80 bg-neutral-950/50 hover:bg-neutral-900/50 rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 group relative"
          >
            {uploadingPack ? (
              <div className="flex flex-col items-center space-y-2 text-cyan-400">
                <FontAwesomeIcon icon={faSpinner} spin className="text-2xl" />
                <span className="text-sm font-semibold">Uploading & configuring resource pack in server.properties...</span>
              </div>
            ) : getProp('resource-pack') ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                    <FontAwesomeIcon icon={faFileArchive} className="text-lg" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-white">Active Resource Pack</span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono">
                        LINKED
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 font-mono truncate max-w-md mt-0.5">
                      {getProp('resource-pack')}
                    </p>
                    {getProp('resource-pack-sha1') && (
                      <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                        SHA-1: {getProp('resource-pack-sha1')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => packInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-colors"
                  >
                    Replace .zip
                  </button>
                  <button
                    type="button"
                    onClick={handleDeletePack}
                    disabled={deletingPack}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/60 transition-colors"
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
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 border border-neutral-700 group-hover:border-cyan-500/50 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                  <FontAwesomeIcon icon={faCloudUploadAlt} className="text-xl" />
                </div>
                <div className="text-sm font-bold text-neutral-200 group-hover:text-cyan-300 transition-colors">
                  Upload Resource Pack (.zip)
                </div>
                <p className="text-xs text-neutral-400 max-w-sm">
                  Click to select your server resource pack (.zip). It will automatically be hosted on your panel and written to server.properties!
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
                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-300">Prompt Message (Optional)</label>
              <input
                type="text"
                value={getProp('resource-pack-prompt', '')}
                onChange={(e) => updateProp('resource-pack-prompt', e.target.value, false)}
                onBlur={(e) => updateProp('resource-pack-prompt', e.target.value, true)}
                placeholder="Custom message shown to players..."
                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-700/40">
            <div>
              <label className="text-sm font-semibold text-neutral-200">Require Resource Pack</label>
              <p className="text-xs text-neutral-400">Disconnect players who decline to download the resource pack</p>
            </div>
            <button
              type="button"
              onClick={() => toggleBoolProp('require-resource-pack', false)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                getBoolProp('require-resource-pack', false) ? 'bg-cyan-600' : 'bg-neutral-700'
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
      </div>
    </ServerContentBlock>
  );
}
