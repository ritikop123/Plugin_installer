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
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Scroll strictly within chat messages container (NEVER scrolls outer window)
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, loading]);

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

                {/* Executed Action Badge */}
                {msg.action && msg.action !== 'none' && (
                  <div className="mt-3 pt-2.5 border-t border-gray-700/60">
                    <div
                      className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                        msg.action_result?.success
                          ? 'bg-emerald-950/40 border border-emerald-500/40 text-emerald-300'
                          : 'bg-blue-950/40 border border-blue-500/40 text-blue-300'
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={msg.action_result?.success ? faCheck : faTerminal}
                        className={msg.action_result?.success ? 'text-emerald-400' : 'text-blue-400'}
                      />
                      <span className="font-semibold uppercase tracking-wider text-[11px]">
                        Action: {msg.action.replace(/_/g, ' ')}
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
              <div className="w-8 h-8 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-300 text-xs flex-shrink-0 animate-pulse">
                <FontAwesomeIcon icon={faRobot} />
              </div>
              <div className="bg-gray-800 border border-gray-700 text-gray-300 rounded-2xl px-5 py-3.5 text-xs flex items-center gap-2.5">
                <FontAwesomeIcon icon={faSpinner} spin className="text-blue-400" />
                <span className="animate-pulse">Thinking & executing server action...</span>
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
