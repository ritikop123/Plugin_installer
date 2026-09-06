import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSlidersH,
  faServer,
  faCopy,
  faCheck,
  faLock,
  faCamera,
  faTrashAlt,
  faRedo,
  faSave,
  faUndo,
  faExclamationTriangle,
  faSpinner,
  faInfoCircle,
  faShieldAlt,
  faGamepad,
  faGlobe,
  faUsers,
  faSkullCrossbones,
  faEye,
  faCloudUploadAlt,
  faPalette,
  faMinus,
  faPlus,
} from '@fortawesome/free-solid-svg-icons';

interface OptionsApiResponse {
  success: boolean;
  address?: string;
  port?: number;
  server_name?: string;
  has_icon?: boolean;
  icon_data?: string | null;
  file_exists?: boolean;
  properties?: Record<string, string>;
}

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

// Minecraft Format Styles
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
  if (!rawText || rawText.trim() === '') {
    return [
      <span key="empty" className="text-neutral-400 italic">
        A Minecraft Server
      </span>,
    ];
  }

  const normalized = rawText.replace(/\\u00A7/gi, '§');
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

// Default Minecraft Grass Block Icon (SVG Data URL)
const DEFAULT_MC_ICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%234b3621"/><polygon points="0,0 64,0 64,22 0,22" fill="%23567d46"/><polygon points="0,22 8,28 16,22 24,30 32,22 40,28 48,22 56,28 64,22 64,26 56,32 48,26 40,32 32,26 24,34 16,26 8,32 0,26" fill="%233e5c2e"/><rect x="8" y="38" width="6" height="6" fill="%233b2a1a"/><rect x="36" y="44" width="8" height="6" fill="%233b2a1a"/><rect x="22" y="52" width="6" height="6" fill="%233b2a1a"/><rect x="48" y="34" width="6" height="6" fill="%233b2a1a"/></svg>';

export default function OptionsContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
  const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

  // Core State
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingIcon, setUploadingIcon] = useState<boolean>(false);
  const [deletingIcon, setDeletingIcon] = useState<boolean>(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Server Info & Properties
  const [serverAddress, setServerAddress] = useState<string>('');
  const [hasCustomIcon, setHasCustomIcon] = useState<boolean>(false);
  const [iconData, setIconData] = useState<string | null>(null);
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [originalProperties, setOriginalProperties] = useState<Record<string, string>>({});

  // UI Interactivity
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [motdPrefix, setMotdPrefix] = useState<'§' | '&'>('§');
  const [showMotdTools, setShowMotdTools] = useState<boolean>(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const motdTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch initial server options and properties
  const loadOptions = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await http.get<OptionsApiResponse>(`/api/client/servers/${uuid}/options`);
      if (res.data.success) {
        setServerAddress(res.data.address || '');
        setHasCustomIcon(!!res.data.has_icon);
        setIconData(res.data.icon_data || null);
        const props = res.data.properties || {};
        setProperties(props);
        setOriginalProperties(props);
      }
    } catch (err) {
      console.error(err);
      setActionError(httpErrorToHuman(err));
    } finally {
      setLoading(false);
    }
  }, [uuid]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Check for unsaved changes
  const hasUnsavedChanges = Object.keys(properties).some(
    (key) => properties[key] !== originalProperties[key]
  ) || Object.keys(originalProperties).some(
    (key) => properties[key] !== originalProperties[key]
  );

  // Property helper functions
  const getProp = (key: string, fallback: string = ''): string => {
    return properties[key] !== undefined ? properties[key] : fallback;
  };

  const getBoolProp = (key: string, fallback: boolean = false): boolean => {
    const val = properties[key];
    if (val === undefined) return fallback;
    return val.toLowerCase() === 'true';
  };

  const setProp = (key: string, value: string) => {
    setProperties((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleBoolProp = (key: string, fallback: boolean = false) => {
    const current = getBoolProp(key, fallback);
    setProp(key, (!current).toString());
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
    const currentVal = getProp('motd', 'A Minecraft Server');
    if (!textarea) {
      setProp('motd', currentVal + insertStr);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = currentVal.substring(0, start) + insertStr + currentVal.substring(end);
    setProp('motd', updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + insertStr.length, start + insertStr.length);
    }, 0);
  };

  // Icon File Upload Handler with Client-Side 64x64 Canvas Resizing
  const handleIconSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be reselected if needed
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
          setActionError('Unable to process image on this browser.');
          return;
        }

        ctx.clearRect(0, 0, 64, 64);
        ctx.drawImage(img, 0, 0, 64, 64);
        const base64Png = canvas.toDataURL('image/png');

        // Upload to Backend
        setUploadingIcon(true);
        setActionError(null);
        setActionStatus(null);
        try {
          const res = await http.post(`/api/client/servers/${uuid}/options/icon`, {
            icon_data: base64Png,
          });
          if (res.data.success) {
            setIconData(res.data.icon_data || base64Png);
            setHasCustomIcon(true);
            setActionStatus('Server icon updated! Restart your server to see it in multiplayer lists.');
            setTimeout(() => setActionStatus(null), 5000);
          }
        } catch (err) {
          console.error(err);
          setActionError(httpErrorToHuman(err));
        } finally {
          setUploadingIcon(false);
        }
      };
      img.src = uploadEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Delete Custom Icon
  const handleDeleteIcon = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove the custom server icon and revert to default?')) {
      return;
    }

    setDeletingIcon(true);
    setActionError(null);
    setActionStatus(null);
    try {
      const res = await http.delete(`/api/client/servers/${uuid}/options/icon`);
      if (res.data.success) {
        setIconData(null);
        setHasCustomIcon(false);
        setActionStatus('Custom server icon removed successfully.');
        setTimeout(() => setActionStatus(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setActionError(httpErrorToHuman(err));
    } finally {
      setDeletingIcon(false);
    }
  };

  // Save server.properties
  const handleSaveProperties = async () => {
    setSaving(true);
    setActionError(null);
    setActionStatus(null);
    try {
      const res = await http.post(`/api/client/servers/${uuid}/options`, {
        properties,
      });
      if (res.data.success) {
        setOriginalProperties(properties);
        setActionStatus('Server properties saved successfully! Please restart your server to apply changes.');
        setTimeout(() => setActionStatus(null), 6000);
      }
    } catch (err) {
      console.error(err);
      setActionError(httpErrorToHuman(err));
    } finally {
      setSaving(false);
    }
  };

  // Reset to original properties
  const handleResetProperties = () => {
    setProperties(originalProperties);
    setActionStatus('Properties reverted to last saved state.');
    setTimeout(() => setActionStatus(null), 3000);
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
        {/* Hidden File Input for Icon Picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleIconSelected}
        />

        {/* Action Status / Error Banners */}
        {actionStatus && (
          <div className="flex items-center space-x-3 bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl shadow-lg transition-all animate-fade-in">
            <FontAwesomeIcon icon={faCheck} className="text-emerald-400 text-lg flex-shrink-0" />
            <span className="text-sm font-medium">{actionStatus}</span>
          </div>
        )}

        {actionError && (
          <div className="flex items-center space-x-3 bg-red-950/70 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl shadow-lg transition-all animate-fade-in">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400 text-lg flex-shrink-0" />
            <span className="text-sm font-medium">{actionError}</span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TOP SECTION: Authentic Minecraft Multiplayer Server Banner */}
        {/* ========================================================================= */}
        <div className="bg-neutral-900/90 border border-neutral-700/80 rounded-2xl p-5 shadow-2xl backdrop-blur-sm relative overflow-hidden">
          {/* Subtle Background Accent */}
          <div className="absolute top-0 right-0 w-96 h-48 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
            {/* Left: Icon & Server Info */}
            <div className="flex items-center space-x-4">
              {/* 64x64 Minecraft Server Icon Box */}
              <div
                onClick={() => !uploadingIcon && fileInputRef.current?.click()}
                className="relative group cursor-pointer w-16 h-16 rounded-xl border-2 border-neutral-700 hover:border-cyan-500 transition-all duration-200 bg-black/60 overflow-hidden flex-shrink-0 shadow-md"
                title="Click to change server icon (64×64 PNG)"
              >
                <img
                  src={iconData || DEFAULT_MC_ICON}
                  alt="Server Icon"
                  className="w-full h-full object-cover pixelated"
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
                    title="Remove custom icon"
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
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
                    Online
                  </span>
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

            {/* Right: Signal Bars & MOTD Toggle */}
            <div className="flex items-center space-x-4 self-end md:self-center">
              {/* Authentic Minecraft Multiplayer Ping Signal Bars */}
              <div className="flex items-end space-x-1 h-5 px-2 py-1 bg-neutral-800/70 border border-neutral-700/60 rounded-lg" title="Server Allocation Connected">
                <span className="w-1 h-2 bg-emerald-400 rounded-sm" />
                <span className="w-1 h-3 bg-emerald-400 rounded-sm" />
                <span className="w-1 h-4 bg-emerald-400 rounded-sm" />
                <span className="w-1 h-5 bg-emerald-400 rounded-sm" />
                <span className="w-1 h-6 bg-emerald-400 rounded-sm" />
              </div>

              {/* Toggle MOTD Editor Button */}
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
                {renderMotdSpans(getProp('motd', 'A Minecraft Server'))}
              </div>
            </div>
          </div>

          {/* Expandable MOTD Editor Toolbar */}
          {showMotdTools && (
            <div className="mt-4 pt-4 border-t border-neutral-800 space-y-3 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-neutral-300 flex items-center space-x-2">
                  <span>Change MOTD Description</span>
                  <span className="text-neutral-400 font-normal text-[11px]">(Supports color codes & line breaks)</span>
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
                </div>
              </div>

              {/* MOTD Input Textarea */}
              <textarea
                ref={motdTextareaRef}
                rows={2}
                value={getProp('motd', 'A Minecraft Server')}
                onChange={(e) => setProp('motd', e.target.value)}
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
                    if (current > 1) setProp('max-players', (current - 1).toString());
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
                  onChange={(e) => setProp('max-players', e.target.value)}
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('max-players', '20'), 10) || 20;
                    setProp('max-players', (current + 1).toString());
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
                onChange={(e) => setProp('gamemode', e.target.value)}
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
                onChange={(e) => setProp('difficulty', e.target.value)}
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
            {/* Note: online-mode=false means Cracked players CAN join. online-mode=true means Premium accounts only */}
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
                  // Invert online-mode: when toggled ON, online-mode becomes false (cracked enabled)
                  const isCracked = !getBoolProp('online-mode', true);
                  setProp('online-mode', isCracked ? 'true' : 'false');
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
                    if (current > 0) setProp('spawn-protection', (current - 1).toString());
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
                  onChange={(e) => setProp('spawn-protection', e.target.value)}
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('spawn-protection', '16'), 10) || 0;
                    setProp('spawn-protection', (current + 1).toString());
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
                    if (current > 2) setProp('view-distance', (current - 1).toString());
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
                  onChange={(e) => setProp('view-distance', e.target.value)}
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('view-distance', '10'), 10) || 10;
                    if (current < 32) setProp('view-distance', (current + 1).toString());
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
                    if (current > 2) setProp('simulation-distance', (current - 1).toString());
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
                  onChange={(e) => setProp('simulation-distance', e.target.value)}
                  className="w-16 bg-neutral-900 border border-neutral-700 rounded-lg py-1 text-center text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const current = parseInt(getProp('simulation-distance', '10'), 10) || 10;
                    if (current < 32) setProp('simulation-distance', (current + 1).toString());
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
        {/* CARD 5: Resource Pack Settings */}
        {/* ------------------------------------------------------------- */}
        <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center space-x-2.5 pb-3 border-b border-neutral-700/60">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
              <FontAwesomeIcon icon={faCloudUploadAlt} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Server Resource Pack</h3>
              <p className="text-xs text-neutral-400">Optional or mandatory texture/resource packs prompted upon joining</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-neutral-300">Resource Pack Direct URL (.zip)</label>
              <input
                type="text"
                value={getProp('resource-pack', '')}
                onChange={(e) => setProp('resource-pack', e.target.value)}
                placeholder="https://example.com/pack.zip"
                className="mt-1 w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-300">Prompt Message (Optional)</label>
              <input
                type="text"
                value={getProp('resource-pack-prompt', '')}
                onChange={(e) => setProp('resource-pack-prompt', e.target.value)}
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

        {/* ========================================================================= */}
        {/* BOTTOM STICKY ACTION BAR */}
        {/* ========================================================================= */}
        <div className="sticky bottom-4 z-30 bg-neutral-900/95 border border-neutral-700/80 backdrop-blur-md rounded-2xl p-4 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2.5 text-xs text-neutral-400">
            <FontAwesomeIcon icon={faInfoCircle} className="text-cyan-400 text-sm flex-shrink-0" />
            <span>
              {hasUnsavedChanges ? (
                <span className="text-amber-300 font-medium">You have unsaved changes. Remember to restart your server after saving.</span>
              ) : (
                <span>All properties are up to date. Restart your server whenever you change configuration.</span>
              )}
            </span>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={handleResetProperties}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition-colors flex items-center space-x-1.5"
              >
                <FontAwesomeIcon icon={faUndo} />
                <span>Discard Changes</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveProperties}
              disabled={saving}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center space-x-2 ${
                hasUnsavedChanges
                  ? 'bg-cyan-500 hover:bg-cyan-400 text-neutral-950 shadow-cyan-500/25'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
              }`}
            >
              {saving ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  <span>Saving Properties...</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} />
                  <span>Save Properties</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ServerContentBlock>
  );
}
