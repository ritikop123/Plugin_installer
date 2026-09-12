import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMoon,
  faBolt,
  faPowerOff,
  faClock,
  faServer,
  faSave,
  faSpinner,
  faCheckCircle,
  faInfoCircle,
  faMobileAlt,
  faSyncAlt,
} from '@fortawesome/free-solid-svg-icons';

interface SmartSleepSettings {
  enabled: boolean;
  timeout: number;
  custom_motd: string;
  bedrock_port: number | null;
  updated_at?: string;
}

export default function SmartSleepContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
  const serverName = ServerContext.useStoreState((state) => state.server.data?.name);
  const serverMemory = ServerContext.useStoreState((state) => state.server.data?.memory || 0);

  const [settings, setSettings] = useState<SmartSleepSettings>({
    enabled: true,
    timeout: 20,
    custom_motd: '',
    bedrock_port: null,
  });

  const [isProxy, setIsProxy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [waking, setWaking] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);

  const fetchSettings = useCallback(() => {
    setLoading(true);
    http
      .get<{ success: boolean; settings: SmartSleepSettings; is_proxy?: boolean }>(`/api/client/servers/${uuid}/smartsleep`)
      .then((res) => {
        if (res.data?.settings) {
          setSettings(res.data.settings);
        }
        if (res.data?.is_proxy) {
          setIsProxy(true);
        }
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to load SmartSleep settings.',
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [uuid]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const res = await http.post<{ success: boolean; message: string; settings: SmartSleepSettings }>(
        `/api/client/servers/${uuid}/smartsleep`,
        settings
      );
      setNotice({
        success: true,
        message: res.data.message || 'SmartSleep configuration saved successfully!',
      });
      if (res.data.settings) {
        setSettings(res.data.settings);
      }
    } catch (err) {
      setNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Failed to save SmartSleep configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleManualWake = async () => {
    setWaking(true);
    setNotice(null);
    try {
      const res = await http.post<{ success: boolean; message: string }>(
        `/api/client/servers/${uuid}/smartsleep/wake`
      );
      setNotice({
        success: true,
        message: res.data.message || 'Wake-up command sent! Server is starting.',
      });
    } catch (err) {
      setNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Failed to wake server.',
      });
    } finally {
      setWaking(false);
    }
  };

  return (
    <ServerContentBlock title={'SmartSleep Gateway'}>
      <div className="max-w-6xl mx-auto space-y-6 my-2">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <FontAwesomeIcon icon={faMoon} className="text-lg" />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">SmartSleep Optimization</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Automatically hibernate your server when 0 players are active to free RAM and CPU. Wakes up instantly on join.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualWake}
              disabled={waking}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faBolt} className={waking ? 'animate-spin' : ''} />
              <span>{waking ? 'Waking...' : 'Wake Server Now'}</span>
            </button>

            <button
              type="button"
              onClick={fetchSettings}
              disabled={loading}
              className="p-2 bg-[#111728]/80 hover:bg-[#151d32] border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs transition-colors"
              title="Refresh settings"
            >
              <FontAwesomeIcon icon={faSyncAlt} className={loading ? 'animate-spin text-blue-400' : ''} />
            </button>
          </div>
        </div>

        {/* Notice Alert */}
        {notice && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 transition-all ${
              notice.success
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            <FontAwesomeIcon icon={notice.success ? faCheckCircle : faInfoCircle} />
            <span>{notice.message}</span>
          </div>
        )}

        {/* Velocity / Proxy Server Notice */}
        {isProxy && (
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs flex items-start gap-3 shadow-md">
            <FontAwesomeIcon icon={faInfoCircle} className="text-base mt-0.5 text-indigo-400 shrink-0" />
            <div>
              <h4 className="font-bold text-white text-sm">Proxy Server Detected (Velocity / BungeeCord)</h4>
              <p className="mt-0.5 text-slate-300 leading-relaxed">
                SmartSleep automatically detected this server as a network proxy. Auto-hibernation is safely disabled for proxy servers to keep your player routing network online 24/7.
              </p>
            </div>
          </div>
        )}

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111728]/80 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-md">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
              <FontAwesomeIcon icon={faServer} className="text-xl" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status Mode</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${settings.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <h3 className="text-sm font-bold text-white">
                  {settings.enabled ? 'SmartSleep Active' : 'Hibernation Disabled'}
                </h3>
              </div>
            </div>
          </div>

          <div className="bg-[#111728]/80 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-md">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <FontAwesomeIcon icon={faClock} className="text-xl" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Inactivity Sleep Timer</span>
              <h3 className="text-sm font-bold text-white mt-0.5">
                {settings.timeout} minutes empty
              </h3>
            </div>
          </div>

          <div className="bg-[#111728]/80 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3.5 shadow-md">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <FontAwesomeIcon icon={faPowerOff} className="text-xl" />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Released RAM When Asleep</span>
              <h3 className="text-sm font-bold text-white mt-0.5">
                {serverMemory > 0 ? `${(serverMemory / 1024).toFixed(1)} GB freed` : 'Full JVM Heap freed'}
              </h3>
            </div>
          </div>
        </div>

        {/* Configuration Form */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-400" />
            <span>Loading SmartSleep configuration...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="bg-[#111728]/70 border border-slate-800 rounded-2xl p-5 space-y-6 shadow-xl backdrop-blur-md">
            {/* Toggle Enable Switch */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="space-y-0.5">
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <FontAwesomeIcon icon={faMoon} className="text-indigo-400" />
                  <span>Enable Auto-Hibernation</span>
                </label>
                <p className="text-xs text-slate-400">
                  When enabled, this server will safely save and power down after sitting empty with 0 players.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.enabled ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Timeout Slider / Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white uppercase tracking-wider">
                  Inactivity Timeout Before Sleep
                </label>
                <span className="text-xs font-bold text-indigo-400 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-md">
                  {settings.timeout} Minutes
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Number of minutes the server can remain completely empty (0 players) before saving and sleeping.
              </p>
              <div className="pt-2 space-y-2">
                <input
                  type="range"
                  min="1"
                  max="120"
                  step="1"
                  value={settings.timeout}
                  onChange={(e) => setSettings((s) => ({ ...s, timeout: Number(e.target.value) }))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>1 min</span>
                  <span>20 mins (Default)</span>
                  <span>60 mins</span>
                  <span>120 mins</span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Presets:</span>
                  {[
                    { label: '2 mins (Test)', val: 2 },
                    { label: '5 mins', val: 5 },
                    { label: '15 mins', val: 15 },
                    { label: '20 mins', val: 20 },
                    { label: '30 mins', val: 30 },
                    { label: '60 mins', val: 60 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => setSettings((s) => ({ ...s, timeout: preset.val }))}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                        settings.timeout === preset.val
                          ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 font-bold'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sleeping MOTD Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white uppercase tracking-wider">
                Custom Sleeping MOTD (Server List Message)
              </label>
              <p className="text-xs text-slate-400">
                Text displayed in the Minecraft multiplayer menu when this server is hibernating. Leave blank for default.
              </p>
              <input
                type="text"
                value={settings.custom_motd}
                onChange={(e) => setSettings((s) => ({ ...s, custom_motd: e.target.value }))}
                placeholder={`§a${serverName || 'My Server'} §7[Sleeping] - §eJoin to wake up!`}
                className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none transition-colors"
              />
            </div>

            {/* Geyser / Bedrock UDP Port */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <FontAwesomeIcon icon={faMobileAlt} className="text-slate-400" />
                <span>Bedrock / Geyser UDP Port (Optional)</span>
              </label>
              <p className="text-xs text-slate-400">
                If your server uses Geyser for Bedrock crossplay on a secondary port (e.g. 19132 or 25566), enter it here.
              </p>
              <input
                type="number"
                value={settings.bedrock_port ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    bedrock_port: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                placeholder="19132 (or leave empty if using primary port)"
                className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none transition-colors max-w-sm"
              />
            </div>

            {/* Save Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
              >
                <FontAwesomeIcon icon={saving ? faSpinner : faSave} className={saving ? 'animate-spin' : ''} />
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </ServerContentBlock>
  );
}
