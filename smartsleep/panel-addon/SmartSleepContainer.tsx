import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faClock,
  faInfoCircle,
  faPowerOff,
  faSave,
  faServer,
  faSpinner,
  faSyncAlt,
  faCheckCircle,
} from '@fortawesome/free-solid-svg-icons';

interface AutoStopSettings {
  enabled: boolean;
}

export default function SmartSleepContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
  const [settings, setSettings] = useState<AutoStopSettings>({ enabled: true });
  const [isProxy, setIsProxy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);

  const fetchSettings = useCallback(() => {
    setLoading(true);
    http
      .get<{ success: boolean; settings: AutoStopSettings; is_proxy?: boolean }>(
        `/api/client/servers/${uuid}/smartsleep`
      )
      .then((res) => {
        if (res.data?.settings) {
          setSettings(res.data.settings);
        }
        setIsProxy(Boolean(res.data?.is_proxy));
      })
      .catch((err) => {
        setNotice({
          success: false,
          message: httpErrorToHuman(err) || 'Failed to load auto-stop settings.',
        });
      })
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const res = await http.post<{ success: boolean; message: string; settings: AutoStopSettings }>(
        `/api/client/servers/${uuid}/smartsleep`,
        settings
      );
      setNotice({
        success: true,
        message: res.data.message || 'Auto-stop configuration saved successfully.',
      });
      if (res.data.settings) {
        setSettings(res.data.settings);
      }
    } catch (err) {
      setNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Failed to save auto-stop settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ServerContentBlock title={'SmartSleep Auto-Stop'}>
      <div className="max-w-4xl mx-auto space-y-6 my-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <FontAwesomeIcon icon={faPowerOff} className="text-lg" />
              </span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Automatic Idle Stop</h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Stops an empty server after 48 hours. Start it again normally from the panel.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSettings}
            disabled={loading}
            className="self-start p-2 bg-[#111728]/80 hover:bg-[#151d32] border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs transition-colors"
            title="Refresh settings"
          >
            <FontAwesomeIcon icon={faSyncAlt} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>

        {notice && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
              notice.success
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
            }`}
          >
            <FontAwesomeIcon icon={notice.success ? faCheckCircle : faInfoCircle} />
            <span>{notice.message}</span>
          </div>
        )}

        {isProxy && (
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-200 text-xs flex items-start gap-3">
            <FontAwesomeIcon icon={faInfoCircle} className="text-base mt-0.5 text-indigo-400 shrink-0" />
            <div>
              <h4 className="font-bold text-white text-sm">Proxy Server Detected</h4>
              <p className="mt-0.5 text-slate-300 leading-relaxed">
                Automatic stopping is disabled for proxy servers so player routing remains online.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
            <FontAwesomeIcon icon={faSpinner} spin className="text-2xl text-blue-400" />
            <span>Loading auto-stop settings...</span>
          </div>
        ) : (
          <form
            onSubmit={handleSave}
            className="bg-[#111728]/70 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl backdrop-blur-md"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#111728]/80 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                  <FontAwesomeIcon icon={faServer} className="text-xl" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Auto-stop
                  </span>
                  <h3 className="text-sm font-bold text-white mt-0.5">
                    {settings.enabled && !isProxy ? 'Enabled' : 'Disabled'}
                  </h3>
                </div>
              </div>

              <div className="bg-[#111728]/80 border border-slate-800/80 rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <FontAwesomeIcon icon={faClock} className="text-xl" />
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Empty-server timeout
                  </span>
                  <h3 className="text-sm font-bold text-white mt-0.5">48 hours (2 days)</h3>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <div className="space-y-0.5">
                <label className="text-sm font-bold text-white flex items-center gap-2">
                  <FontAwesomeIcon icon={faPowerOff} className="text-indigo-400" />
                  <span>Enable automatic stop</span>
                </label>
                <p className="text-xs text-slate-400">
                  Stops the server after 48 continuous hours with zero players. Any detected player resets the timer.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={settings.enabled && !isProxy}
                disabled={isProxy}
                onClick={() => setSettings((current) => ({ enabled: !current.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.enabled && !isProxy ? 'bg-indigo-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.enabled && !isProxy ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

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
