import React, { useState, useEffect, useRef } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRobot,
  faPaperPlane,
  faSpinner,
  faWrench,
  faRedo,
  faBolt,
  faMicrophone,
  faGamepad,
  faTrashAlt,
  faTerminal,
  faCheck,
  faTimes,
  faDownload,
  faServer,
  faCheckCircle,
  faSync,
  faCogs,
  faCubes,
  faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  action?: string;
  action_params?: Record<string, any>;
  pending_action?: string;
  pending_action_params?: Record<string, any>;
  action_result?: {
    success: boolean;
    text: string;
    port?: number;
  };
  timestamp: string;
}

export default function AiAssistantContainer() {
  let uuid = '';
  let serverName = 'Server';
  try {
    uuid = ServerContext.useStoreState((state) => state.server?.data?.uuid || '');
    serverName = ServerContext.useStoreState((state) => state.server?.data?.name || 'Server');
  } catch (e) {
    uuid = '';
    serverName = 'Server';
  }

  const EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes TTL

  const defaultWelcome: Message = {
    id: 'welcome',
    role: 'assistant',
    content: `Hello! I am your AI Server Assistant. I have administrative control over **${serverName}**.\n\nYou can ask me to:\n- 🎮 **Setup Geyser & Floodgate** for Bedrock crossplay\n- 🎙️ **Setup Simple Voice Chat** with allocated UDP ports\n- ⚡ **Optimize server settings** to eliminate lag\n- 🛠️ **Diagnose crashes and auto-fix errors**\n- 🔄 **Restart, start, or stop** the server\n- 💻 **Run console commands** or configure server files`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  // Load message history from localStorage if updated within the last 5 minutes
  const [messages, setMessages] = useState<Message[]>(() => {
    if (!uuid) return [defaultWelcome];
    try {
      const raw = localStorage.getItem(`ptero_ai_history_${uuid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.lastUpdated && Date.now() - parsed.lastUpdated < EXPIRATION_MS) {
          if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
            return parsed.messages;
          }
        } else {
          localStorage.removeItem(`ptero_ai_history_${uuid}`);
        }
      }
    } catch (e) {}
    return [defaultWelcome];
  });

  // Save to localStorage whenever messages update (auto-refreshes 5-minute window)
  useEffect(() => {
    if (!uuid || messages.length <= 1) return;
    try {
      localStorage.setItem(
        `ptero_ai_history_${uuid}`,
        JSON.stringify({
          lastUpdated: Date.now(),
          messages: messages.slice(-20),
        })
      );
    } catch (e) {}
  }, [messages, uuid]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState<string>('Analyzing server logs & diagnostic state...');
  const [loadingProgress, setLoadingProgress] = useState<number>(18);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Dynamic status tracker for background activities
  useEffect(() => {
    if (!loading) {
      setLoadingProgress(18);
      return;
    }

    const steps = [
      { text: '🔍 Reading server logs & diagnosing issue...', progress: 28 },
      { text: '⚙️ Inspecting server files, JARs, and configurations...', progress: 52 },
      { text: '⚡ Executing background action (downloading software / updating files)...', progress: 78 },
      { text: '🚀 Finalizing changes and monitoring server container...', progress: 92 },
    ];

    let currentStep = 0;
    setLoadingStep(steps[0].text);
    setLoadingProgress(steps[0].progress);

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setLoadingStep(steps[currentStep].text);
        setLoadingProgress(steps[currentStep].progress);
      }
    }, 2200);

    return () => clearInterval(interval);
  }, [loading]);

  // Scroll strictly within chat messages container (NEVER scrolls outer window)
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, loading, loadingStep]);

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const historyPayload = messages.slice(-12).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    http
      .post(`/api/client/servers/${uuid}/ai/chat`, {
        message: text,
        history: historyPayload,
      })
      .then((res: any) => {
        const assistantMsg: Message = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.data.message || 'Action executed successfully.',
          thought: res.data.thought,
          action: res.data.action,
          action_params: res.data.action_params,
          pending_action: res.data.pending_action,
          pending_action_params: res.data.pending_action_params,
          action_result: res.data.action_result,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (res.data.action && res.data.action !== 'none' && res.data.action_result?.success) {
          setActiveTask(res.data.action_result?.text || `Action '${res.data.action.replace(/_/g, ' ')}' executed successfully.`);
          setTimeout(() => {
            setActiveTask(null);
          }, 20000);
        }
      })
      .catch((err) => {
        const errMsg: Message = {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Failed to get AI response: ${httpErrorToHuman(err) || 'Internal server error'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errMsg]);
      })
      .finally(() => setLoading(false));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickPrompts = [
    { label: 'Setup Geyser (Bedrock)', icon: faGamepad, prompt: 'Setup Geyser and Floodgate for Bedrock players on my server' },
    { label: 'Setup Voice Chat', icon: faMicrophone, prompt: 'Setup Simple Voice Chat plugin with an allocated UDP port' },
    { label: 'Optimize Lag', icon: faBolt, prompt: 'Optimize my server view-distance and settings to reduce lag' },
    { label: 'Diagnose Crash', icon: faWrench, prompt: 'Check the server logs and let me know if there are any errors or crashes' },
    { label: 'Restart Server', icon: faRedo, prompt: 'Please restart the server now' },
  ];

  return (
    <ServerContentBlock title="AI Assistant" css="overflow-hidden">
      <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[550px] bg-gray-700 backdrop boxBorder rounded-box overflow-hidden shadow-xl border border-gray-600/40">
        {/* Top Header Bar - Clean & Professional matching Arix */}
        <div className="bg-gray-800/90 px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-700/80 border border-gray-600/80 flex items-center justify-center text-white text-base shadow-sm">
              <FontAwesomeIcon icon={faRobot} />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">Server AI Co-Pilot</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Full control over server power, configs, ports, plugins & console
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem(`ptero_ai_history_${uuid}`);
              } catch (e) {}
              setMessages([
                {
                  id: 'reset',
                  role: 'assistant',
                  content: 'Chat cleared. How can I help you with your Minecraft server?',
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
            }}
            className="px-3.5 py-1.5 rounded-component bg-gray-800 hover:bg-gray-750 text-gray-300 hover:text-white border border-gray-600/60 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm"
            title="Clear Chat"
          >
            <FontAwesomeIcon icon={faTrashAlt} className="text-gray-400 text-xs" />
            <span>Clear Chat</span>
          </button>
        </div>

        {/* Live Background Task Active Banner */}
        {activeTask && (
          <div className="bg-emerald-950/70 border-b border-emerald-500/30 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-200 transition-all animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-semibold text-emerald-300">Background Server Activity:</span>
              <span className="opacity-95">{activeTask}</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTask(null)}
              className="text-emerald-400/70 hover:text-emerald-200 text-xs px-2 py-0.5 rounded transition-all"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
        )}

        {/* Message Thread - Self-contained scroll container */}
        <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-[#12161f]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300 text-xs flex-shrink-0 mt-1 shadow-sm">
                  <FontAwesomeIcon icon={faRobot} />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-[#2563eb] text-white shadow-md'
                    : 'bg-gray-800/95 border border-gray-700 text-gray-100 shadow-md'
                }`}
              >
                {/* Internal Reasoning note if provided */}
                {msg.thought && (
                  <div className="mb-2 pb-2 border-b border-gray-700/70 text-[11px] text-amber-300/90 font-mono">
                    💡 {msg.thought}
                  </div>
                )}

                {/* Formatted Content */}
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Interactive Confirmation Action Buttons */}
                {msg.role === 'assistant' && (
                  Boolean(msg.pending_action && msg.pending_action !== 'none') ||
                  /(confirm|want me to proceed|Shall I proceed|Would you like me to|want me to delete|want me to install|want me to fix|No server changes were made yet|proceed with this fix|do you want me to|should I|shall I|let me know if you want|reply with yes|can fix this|can remove|can delete|can install|\?)/i.test(msg.content)
                ) && (
                  <div className="mt-3.5 pt-2.5 border-t border-gray-700/60 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        const targetAction = msg.pending_action || (msg.action && msg.action !== 'none' ? msg.action : null);
                        const targetParams = msg.pending_action_params || msg.action_params || {};
                        if (targetAction) {
                          handleSendMessage(`Yes, do it: execute ${targetAction} ${JSON.stringify(targetParams)}`);
                        } else {
                          handleSendMessage('Yes, do it');
                        }
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faCheck} className="text-[11px]" />
                      <span>Yes, do it</span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleSendMessage("No, don't do that. Cancel.")}
                      className="px-3 py-1.5 rounded-xl bg-gray-700/90 hover:bg-gray-600 text-gray-200 font-medium text-xs flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faTimes} className="text-[11px]" />
                      <span>No, don't do</span>
                    </button>
                  </div>
                )}

                {/* Prominent Executed Action Card */}
                {msg.action && msg.action !== 'none' && (
                  <div className="mt-3.5 pt-3 border-t border-gray-700/60">
                    <div
                      className={`rounded-xl p-3.5 border transition-all ${
                        msg.action_result?.success
                          ? 'bg-gradient-to-br from-emerald-950/40 via-gray-900/60 to-emerald-950/20 border-emerald-500/40 shadow-sm'
                          : 'bg-gradient-to-br from-blue-950/40 via-gray-900/60 to-blue-950/20 border-blue-500/40 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${
                              msg.action_result?.success
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}
                          >
                            <FontAwesomeIcon
                              icon={
                                msg.action === 'install_software' || msg.action === 'install_plugin' || msg.action === 'install_mod'
                                  ? faDownload
                                  : msg.action === 'install_modpack'
                                  ? faLayerGroup
                                  : msg.action === 'delete_file' || msg.action === 'delete_world'
                                  ? faTrashAlt
                                  : msg.action === 'configure_universal_access'
                                  ? faServer
                                  : msg.action === 'restart_server'
                                  ? faRedo
                                  : msg.action === 'setup_voicechat'
                                  ? faMicrophone
                                  : msg.action === 'setup_geyser' || msg.action === 'enable_geyser_clone_port'
                                  ? faGamepad
                                  : msg.action === 'optimize_server'
                                  ? faBolt
                                  : faCheck
                              }
                            />
                          </div>
                          <div>
                            <div className="font-bold uppercase tracking-wider text-[11px] text-gray-200">
                              {msg.action.replace(/_/g, ' ')}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {msg.action === 'install_software' && 'Official Server JAR Installation (Wings Stream)'}
                              {msg.action === 'install_plugin' && 'Built-in Plugin Installation (Modrinth / Hangar)'}
                              {msg.action === 'install_mod' && 'Built-in Mod Installation (Modrinth)'}
                              {msg.action === 'install_modpack' && 'Built-in Modpack Installation (Modrinth / Overrides Engine)'}
                              {msg.action === 'delete_file' && 'Corrupted File Cleanup'}
                              {msg.action === 'delete_world' && 'Corrupted World & Dimension Cleanup'}
                              {msg.action === 'configure_universal_access' && 'Universal Client & Cracked Support'}
                              {msg.action === 'disable_whitelist' && 'Server Whitelist Disabled'}
                              {msg.action === 'enable_geyser_clone_port' && 'Bedrock Port Synchronization'}
                              {msg.action === 'restart_server' && 'Server Restart Dispatched'}
                              {msg.action === 'optimize_server' && 'Lag-reduction Configuration'}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                            msg.action_result?.success
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          <FontAwesomeIcon icon={msg.action_result?.success ? faCheck : faTerminal} className="text-[9px]" />
                          <span>{msg.action_result?.success ? 'Completed' : 'Dispatched'}</span>
                        </span>
                      </div>

                      {/* Target details if params exist */}
                      {msg.action_params && Object.keys(msg.action_params).length > 0 && (
                        <div className="bg-black/40 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-gray-300 mb-2 border border-white/5 flex flex-wrap gap-x-3 gap-y-1">
                          {msg.action_params.software && (
                            <span>Software: <strong className="text-emerald-400">{msg.action_params.software}</strong></span>
                          )}
                          {msg.action_params.version && (
                            <span>Version: <strong className="text-blue-400">{msg.action_params.version}</strong></span>
                          )}
                          {msg.action_params.plugin && (
                            <span>Plugin: <strong className="text-emerald-400">{msg.action_params.plugin}</strong></span>
                          )}
                          {msg.action_params.mod && (
                            <span>Mod: <strong className="text-blue-400">{msg.action_params.mod}</strong></span>
                          )}
                          {msg.action_params.modpack && (
                            <span>Modpack: <strong className="text-purple-400">{msg.action_params.modpack}</strong></span>
                          )}
                          {msg.action_params.file && (
                            <span>Target: <strong className="text-amber-400">{msg.action_params.file}</strong></span>
                          )}
                          {msg.action_params.target && (
                            <span>Dimension: <strong className="text-amber-400">{msg.action_params.target}</strong></span>
                          )}
                          {msg.action_params.key && (
                            <span>{msg.action_params.key} = <strong className="text-emerald-400">{msg.action_params.value}</strong></span>
                          )}
                        </div>
                      )}

                      {/* Result description */}
                      {msg.action_result?.text && (
                        <div className="text-xs text-gray-200 flex items-start gap-1.5 pt-0.5">
                          <span className="text-emerald-400">⚡</span>
                          <span>{msg.action_result.text}</span>
                        </div>
                      )}

                      {/* Step checklist */}
                      <div className="mt-2.5 pt-2 border-t border-gray-700/50 flex items-center gap-4 text-[10px] text-gray-400">
                        <span className="flex items-center gap-1 text-emerald-400">
                          <FontAwesomeIcon icon={faCheck} className="text-[9px]" /> Dispatched
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <FontAwesomeIcon icon={faCheck} className="text-[9px]" /> Container Updated
                        </span>
                        <span className="flex items-center gap-1 text-emerald-400">
                          <FontAwesomeIcon icon={faCheck} className="text-[9px]" /> Server Notified
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div
                  className={`text-[10px] mt-1.5 opacity-60 text-right ${
                    msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          ))}

          {/* Interactive Live Background Activity Progress Card */}
          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gray-800/95 border border-blue-500/40 flex items-center justify-center flex-shrink-0 shadow-md overflow-hidden relative">
                <iframe
                  src="https://embed.lottiefiles.com/animation/2053"
                  className="w-16 h-16 border-0 pointer-events-none scale-125 transform"
                  style={{ background: 'transparent' }}
                  title="AI Loading"
                />
              </div>
              <div className="bg-gray-800/95 border border-blue-500/30 text-gray-100 rounded-2xl p-4 text-xs max-w-[85%] sm:max-w-[75%] shadow-lg space-y-3">
                <div className="flex items-center justify-between gap-3 border-b border-gray-700/60 pb-2">
                  <div className="flex items-center gap-2 text-blue-400 font-semibold text-[11px] uppercase tracking-wider">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span>AI Server Assistant Working</span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">{loadingProgress}%</span>
                </div>

                <div className="flex items-center gap-3 text-gray-200">
                  <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center overflow-hidden rounded-xl bg-gray-900/80 border border-gray-700/60">
                    <iframe
                      src="https://embed.lottiefiles.com/animation/2053"
                      className="w-20 h-20 border-0 pointer-events-none scale-90 transform"
                      style={{ background: 'transparent' }}
                      title="AI Loading Animation"
                    />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="font-semibold text-gray-100 text-xs sm:text-sm">{loadingStep}</div>
                    <div className="text-[10px] text-gray-400">Performing real-time server container operations...</div>
                  </div>
                </div>

                <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 h-1.5 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>

                <div className="text-[10px] text-gray-400 flex items-center justify-between pt-0.5">
                  <span className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faSpinner} spin className="text-blue-400 text-[10px]" />
                    <span>Executing background server task...</span>
                  </span>
                  <span className="opacity-75">Please wait</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Action Chips */}
        <div className="px-4 py-2.5 bg-gray-800/80 border-t border-gray-700 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider flex-shrink-0 pl-1">
            Quick Actions:
          </span>
          {quickPrompts.map((qp, i) => (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => handleSendMessage(qp.prompt)}
              className="flex-shrink-0 bg-gray-800 hover:bg-gray-750 border border-gray-650 hover:border-gray-500 text-gray-200 hover:text-white text-xs px-3.5 py-1.5 rounded-full flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
            >
              <FontAwesomeIcon icon={qp.icon} className="text-blue-400 text-[11px]" />
              <span>{qp.label}</span>
            </button>
          ))}
        </div>

        {/* Message Input Bar */}
        <div className="p-4 bg-gray-800/90 border-t border-gray-700">
          <div className="flex items-center gap-2 bg-[#12161f] border border-gray-700 focus-within:border-gray-500 rounded-xl px-4 py-2 transition-all">
            <input
              type="text"
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to install plugins, setup ports, fix crashes, or manage your server..."
              className="bg-transparent flex-1 text-white text-xs sm:text-sm outline-none placeholder-gray-500"
            />
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={() => handleSendMessage()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow flex items-center gap-2 transition-all disabled:opacity-40"
            >
              <FontAwesomeIcon icon={loading ? faSpinner : faPaperPlane} spin={loading} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>
    </ServerContentBlock>
  );
}
