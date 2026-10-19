import React, { useState, useEffect } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRobot,
  faWrench,
  faPlay,
  faTimes,
  faSpinner,
  faCheckCircle,
  faExclamationTriangle,
  faTerminal,
  faComments,
  faRedo,
} from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface DiagnosisData {
  has_error: boolean;
  issue_title?: string;
  cause?: string;
  solution?: string;
  auto_fixable?: boolean;
  action_type?: string;
  action_params?: any;
  requires_restart?: boolean;
}

export default function AiConsoleModal({ visible, onClose }: Props) {
  let uuid = '';
  try {
    uuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
  } catch (e) {
    uuid = '';
  }

  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [sourceFile, setSourceFile] = useState<string>('');
  const [logSnippet, setLogSnippet] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fixSuccess, setFixSuccess] = useState<string | null>(null);

  const runDiagnosis = () => {
    if (!uuid) return;
    setLoading(true);
    setErrorMsg(null);
    setFixSuccess(null);

    http
      .post(`/api/client/servers/${uuid}/ai/diagnose`)
      .then((res: any) => {
        setDiagnosis(res.data.diagnosis || { has_error: false });
        setSourceFile(res.data.source_file || '');
        setLogSnippet(res.data.log_snippet || '');
      })
      .catch((err) => {
        setErrorMsg(httpErrorToHuman(err) || 'Failed to analyze server logs.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (visible) {
      runDiagnosis();
    }
  }, [visible]);

  const handleAutoFix = () => {
    if (!diagnosis?.action_type) return;

    setFixing(true);
    setErrorMsg(null);
    setFixSuccess(null);

    http
      .post(`/api/client/servers/${uuid}/ai/autofix`, {
        action_type: diagnosis.action_type,
        start_server: true,
      })
      .then((res: any) => {
        setFixSuccess(res.data.message || 'Fix applied successfully! Server is launching.');
        setDiagnosis((prev) => (prev ? { ...prev, has_error: false } : null));
      })
      .catch((err) => {
        setErrorMsg(httpErrorToHuman(err) || 'Auto-fix failed.');
      })
      .finally(() => setFixing(false));
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#111827] border border-cyan-500/30 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden text-gray-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-950/60 via-[#1e293b] to-indigo-950/60 px-6 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400 text-lg shadow-inner">
              <FontAwesomeIcon icon={faRobot} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                AI Server Diagnoser & Auto-Fix
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                  allam-2-7b
                </span>
              </h3>
              <p className="text-gray-400 text-xs">Autonomous crash detection, log analysis and 1-click repairs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-800/60 transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
              <p className="text-cyan-300 font-medium text-sm animate-pulse">
                Analyzing console logs & crash reports with AI...
              </p>
              <span className="text-xs text-gray-500">Checking for EULA, port conflicts, corrupted jars, and exceptions</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-sm flex items-start gap-3">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5 text-red-400 flex-shrink-0" />
              <div>
                <p className="font-semibold">Analysis Notice</p>
                <p className="text-xs text-red-200/80 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {fixSuccess && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-3 animate-fade-in">
              <FontAwesomeIcon icon={faCheckCircle} className="mt-0.5 text-emerald-400 text-lg flex-shrink-0" />
              <div>
                <p className="font-semibold">Repair Applied Successfully!</p>
                <p className="text-xs text-emerald-200/90 mt-0.5">{fixSuccess}</p>
              </div>
            </div>
          )}

          {!loading && diagnosis && (
            <>
              {diagnosis.has_error ? (
                <div className="space-y-4">
                  {/* Issue Box */}
                  <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1">
                      <FontAwesomeIcon icon={faExclamationTriangle} />
                      <span>{diagnosis.issue_title || 'Issue Detected in Server Logs'}</span>
                    </div>
                    <p className="text-xs text-gray-300 mb-2 leading-relaxed">{diagnosis.cause}</p>
                    <div className="p-3 bg-black/40 rounded-lg border border-gray-800 text-xs">
                      <strong className="text-cyan-400 block mb-1">Recommended Solution:</strong>
                      <span className="text-gray-300">{diagnosis.solution}</span>
                    </div>
                  </div>

                  {/* Log Snippet if available */}
                  {logSnippet && (
                    <div className="rounded-xl bg-black/50 border border-gray-800 p-3">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 mb-2 pb-1.5 border-b border-gray-800">
                        <span className="flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faTerminal} className="text-cyan-400" />
                          Source: <code className="text-cyan-300">{sourceFile}</code>
                        </span>
                        <span>Latest Lines</span>
                      </div>
                      <pre className="text-[11px] font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap max-h-36 leading-relaxed">
                        {logSnippet}
                      </pre>
                    </div>
                  )}

                  {/* Auto-Fix CTA */}
                  {diagnosis.auto_fixable && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/40 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <h4 className="text-white font-bold text-sm flex items-center gap-2">
                          <FontAwesomeIcon icon={faWrench} className="text-cyan-400" />
                          1-Click Auto-Fix Ready
                        </h4>
                        <p className="text-xs text-gray-300 mt-0.5">
                          AI will fix this configuration and start your server automatically.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={fixing}
                        onClick={handleAutoFix}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        <FontAwesomeIcon icon={fixing ? faSpinner : faPlay} spin={fixing} />
                        {fixing ? 'Applying Fix...' : 'Auto-Fix & Start Server'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-2xl mx-auto shadow-inner">
                    <FontAwesomeIcon icon={faCheckCircle} />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-base">Server Logs Look Healthy!</h4>
                    <p className="text-gray-400 text-xs mt-1 max-w-md mx-auto">
                      No startup crashes, EULA blocks, or critical port errors were found in recent log files.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#0f172a] px-6 py-3.5 border-t border-gray-800 flex items-center justify-between">
          <Link
            to={`/server/${uuid}/ai`}
            onClick={onClose}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-2 font-medium"
          >
            <FontAwesomeIcon icon={faComments} />
            Open Full AI Chat Assistant
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={runDiagnosis}
              className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <FontAwesomeIcon icon={faRedo} spin={loading} />
              Re-scan
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
