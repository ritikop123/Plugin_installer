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
  faPlay,
  faRedo,
  faBolt,
  faMicrophone,
  faGamepad,
  faNetworkWired,
  faMemory,
  faHdd,
  faTrashAlt,
  faTerminal,
  faCheck,
  faExclamationCircle,
} from '@fortawesome/free-solid-svg-icons';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  action?: string;
  action_result?: {
    success: boolean;
    text: string;
    port?: number;
  };
  timestamp: string;
}

interface ServerInfo {
  name: string;
  uuid: string;
  status: string | null;
  memory_limit: number;
  disk_limit: number;
}

interface Allocation {
  id: number;
  ip: string;
  alias: string | null;
  port: number;
  is_default: boolean;
}

export default function AiAssistantContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
  const serverName = ServerContext.useStoreState((state) => state.server.data!.name);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hello! I am your AI Server Assistant, powered by ultra-fast ALLaM AI. I have full administrative control over **${serverName}**.\n\nYou can ask me to:\n- 🎮 **Setup Geyser & Floodgate** for Bedrock player crossplay\n- 🎙️ **Setup Simple Voice Chat** with your allocated ports\n- ⚡ **Optimize server settings** to eliminate TPS lag\n- 🛠️ **Diagnose crashes and auto-fix errors**\n- 🔄 **Restart, start, or stop** the server\n- 💻 **Run console commands** or edit configuration files`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [pluginsCount, setPluginsCount] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Fetch Server & Allocation Info
  useEffect(() => {
    http
      .get(`/api/client/servers/${uuid}/ai/info`)
      .then((res: any) => {
        setServerInfo(res.data.server);
        setAllocations(res.data.allocations || []);
        setPluginsCount(res.data.plugins_count || 0);
      })
      .catch(() => {});
  }, [uuid]);

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

    const historyPayload = messages.slice(-6).map((m) => ({
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
          action_result: res.data.action_result,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
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
      <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[550px] bg-[#0c1322] border border-cyan-500/20 rounded-2xl overflow-hidden shadow-2xl">
        {/* Top Header Bar */}
        <div className="bg-[#111a2e] px-6 py-3.5 border-b border-gray-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white text-base shadow-lg shadow-cyan-500/30">
              <FontAwesomeIcon icon={faRobot} />
            </div>
            <div>
              <h2 className="text-white font-bold text-sm sm:text-base flex items-center gap-2">
                Server AI Co-Pilot
                <span className="text-[10px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                  allam-2-7b
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">Full control over power, files, ports, plugins & console</p>
            </div>
          </div>

          {/* Real-time server specs pill */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {allocations.length > 0 && (
              <span
                className="bg-gray-800/80 border border-gray-700/60 text-gray-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                title="Allocated Ports"
              >
                <FontAwesomeIcon icon={faNetworkWired} className="text-cyan-400" />
                <span>
                  Port: <strong className="text-white">{allocations.find((a) => a.is_default)?.port || allocations[0]?.port}</strong>
                  {allocations.length > 1 && <span className="text-cyan-400 font-semibold ml-1">+{allocations.length - 1} extra</span>}
                </span>
              </span>
            )}

            {serverInfo && (
              <>
                <span className="bg-gray-800/80 border border-gray-700/60 text-gray-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faMemory} className="text-indigo-400" />
                  <span>{Math.round(serverInfo.memory_limit / 1024)}GB RAM</span>
                </span>
                <span className="bg-gray-800/80 border border-gray-700/60 text-gray-300 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faHdd} className="text-emerald-400" />
                  <span>{pluginsCount} Plugins</span>
                </span>
              </>
            )}

            <button
              onClick={() =>
                setMessages([
                  {
                    id: 'reset',
                    role: 'assistant',
                    content: 'Chat cleared. How can I help you with your Minecraft server?',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  },
                ])
              }
              className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-800/80 transition-colors"
              title="Clear Conversation"
            >
              <FontAwesomeIcon icon={faTrashAlt} />
            </button>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xs flex-shrink-0 mt-0.5">
                  <FontAwesomeIcon icon={faRobot} />
                </div>
              )}

              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                    : 'bg-[#151f33] border border-gray-800 text-gray-200 shadow-md'
                }`}
              >
                {/* Thought box if available */}
                {msg.thought && (
                  <div className="mb-2 pb-2 border-b border-gray-700/50 text-[11px] text-cyan-400 font-mono italic">
                    💡 {msg.thought}
                  </div>
                )}

                {/* Formatted Message Content */}
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Executed Action Badge */}
                {msg.action && msg.action !== 'none' && (
                  <div className="mt-3 pt-2.5 border-t border-gray-700/60">
                    <div
                      className={`p-2 rounded-xl text-xs flex items-center gap-2 ${
                        msg.action_result?.success
                          ? 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300'
                          : 'bg-blue-950/40 border border-blue-500/30 text-blue-300'
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={msg.action_result?.success ? faCheck : faTerminal}
                        className={msg.action_result?.success ? 'text-emerald-400' : 'text-blue-400'}
                      />
                      <span className="font-semibold uppercase tracking-wider text-[10px]">
                        Action: {msg.action.replace('_', ' ')}
                      </span>
                      {msg.action_result?.text && <span className="opacity-90">• {msg.action_result.text}</span>}
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

          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-xs flex-shrink-0 animate-pulse">
                <FontAwesomeIcon icon={faRobot} />
              </div>
              <div className="bg-[#151f33] border border-gray-800 text-gray-400 rounded-2xl px-4 py-3 text-xs flex items-center gap-2">
                <FontAwesomeIcon icon={faSpinner} spin className="text-cyan-400" />
                <span className="animate-pulse">Analyzing server state & preparing execution...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Chips */}
        <div className="px-4 py-2 bg-[#0e1626] border-t border-gray-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider flex-shrink-0 pl-1">
            Quick Actions:
          </span>
          {quickPrompts.map((qp, i) => (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => handleSendMessage(qp.prompt)}
              className="flex-shrink-0 bg-gray-800/70 hover:bg-cyan-950/60 border border-gray-700/60 hover:border-cyan-500/40 text-gray-300 hover:text-cyan-300 text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
            >
              <FontAwesomeIcon icon={qp.icon} className="text-cyan-400 text-[11px]" />
              <span>{qp.label}</span>
            </button>
          ))}
        </div>

        {/* Message Input Form */}
        <div className="p-4 bg-[#111a2e] border-t border-gray-800">
          <div className="flex items-center gap-2 bg-[#0b1220] border border-gray-700/80 focus-within:border-cyan-500/60 rounded-xl px-4 py-2 transition-all shadow-inner">
            <input
              type="text"
              value={input}
              disabled={loading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to install plugins, setup ports, fix crashes, or optimize your server..."
              className="bg-transparent flex-1 text-white text-xs sm:text-sm outline-none placeholder-gray-500"
            />
            <button
              type="button"
              disabled={loading || !input.trim()}
              onClick={() => handleSendMessage()}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-md shadow-cyan-500/20 flex items-center gap-2 transition-all disabled:opacity-40"
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
