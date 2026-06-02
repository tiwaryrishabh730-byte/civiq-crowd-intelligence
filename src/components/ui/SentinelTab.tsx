'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Send,
  Cpu,
  Terminal,
  AlertCircle,
  RefreshCcw,
  User as UserIcon,
  LogOut,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { RadarPulse } from './RadarPulse';
import { auth } from '@/lib/firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

interface SentinelTabProps {
  coordinates: { lat: number; lng: number } | null;
}

const QUICK_QUERIES = ['Is it crowded?', 'Nearby hospitals?', 'Metro status?'];

/** Extract plain text from a v3 UIMessage (parts-based) */
function getMessageText(msg: any): string {
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text ?? '')
      .join('');
  }
  // Fallback for any legacy shape
  return typeof msg.content === 'string' ? msg.content : '';
}

export function SentinelTab({ coordinates }: SentinelTabProps) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Stable transport — recreated only when api changes (never here)
  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/chat',
      body: { isOperator: true } // Agar transport accept karta hai
    }),
    [],
  );

  const { messages, sendMessage, status, error, clearError, regenerate } =
    useChat({ transport });

  const isLoading = status === 'submitted' || status === 'streaming';

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    if (!auth) {
      setAuthError('Uplink Error: Auth System Offline');
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      setAuthError(null);
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('CIVIQ AUTH ERROR:', err);
      setAuthError(`Access Denied: ${err.message}`);
    }
  };

  const handleLogout = () => {
    if (auth) signOut(auth);
  };

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Send helpers ─────────────────────────────────────────────────────────────
  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    await sendMessage(
      { text: trimmed },
      {
        body: {
          lat: coordinates?.lat ?? 0,
          lng: coordinates?.lng ?? 0,
          session_id: user?.uid ?? 'anonymous_session',
        },
      },
    );
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  // ── Markdown helpers ─────────────────────────────────────────────────────────
  const highlightResponse = (text: string) =>
    text.split(/(HIGH|LOW)/g).map((part, i) => {
      if (part === 'HIGH')
        return (
          <span
            key={i}
            className="text-[#EA4335] font-bold drop-shadow-[0_0_8px_rgba(234,67,53,0.5)]"
          >
            HIGH
          </span>
        );
      if (part === 'LOW')
        return (
          <span
            key={i}
            className="text-[#39FF14] font-bold drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]"
          >
            LOW
          </span>
        );
      return part;
    });

  const MarkdownRenderer = ({ content }: { content: string }) => (
    <ReactMarkdown
      components={{
        p: ({ children }) => {
          if (typeof children === 'string') {
            return <p className="mb-2 last:mb-0">{highlightResponse(children)}</p>;
          }
          const processed = Array.isArray(children)
            ? children.map((child, i) =>
              typeof child === 'string' ? highlightResponse(child) : child,
            )
            : children;
          return <p className="mb-2 last:mb-0">{processed}</p>;
        },
        strong: ({ children }) => (
          <strong className="text-[#00F0FF] font-bold">{children}</strong>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );

  // ── Auth gates ───────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] w-full max-w-lg mx-auto bg-black/20 backdrop-blur-md border-x border-[#39FF14]/20 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#39FF14 1px, transparent 1px), linear-gradient(90deg, #39FF14 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        <RefreshCcw className="text-[#39FF14] animate-spin mb-4" size={32} />
        <span className="text-[#39FF14] font-mono text-xs tracking-widest uppercase animate-pulse">
          Initializing Neural Link...
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] w-full max-w-lg mx-auto bg-black/20 backdrop-blur-md border-x border-[#39FF14]/20 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#39FF14 1px, transparent 1px), linear-gradient(90deg, #39FF14 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="z-10 p-8 bg-black/60 border border-[#39FF14]/30 backdrop-blur-xl flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(57,255,20,0.1)] mx-4"
        >
          <div className="relative">
            <div className="p-4 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20">
              <ShieldCheck size={48} className="text-[#39FF14]" />
            </div>
            <div className="absolute -top-2 -right-2">
              <RadarPulse color="#39FF14" />
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-xl font-bold text-[#39FF14] tracking-[0.3em] uppercase neon-text mb-2">
              CIVIQ SENTINEL
            </h2>
            <p className="text-[10px] text-[#9AA0A6] font-mono tracking-wider max-w-[240px] uppercase">
              Uplink Forbidden. Secure Identity Token Required to Access Tactical
              Intelligence.
            </p>
          </div>

          <button
            onClick={handleLogin}
            className="flex items-center gap-3 px-6 py-3 bg-[#39FF14] text-black font-bold text-[11px] tracking-[0.2em] uppercase hover:shadow-[0_0_20px_#39FF14] transition-all active:scale-95 group"
          >
            <LogIn size={16} className="group-hover:translate-x-1 transition-transform" />
            Authorize Operator Profile
          </button>

          {authError && (
            <div className="p-3 bg-[#EA4335]/10 border border-[#EA4335]/30 flex items-center gap-3 max-w-[280px]">
              <AlertCircle size={16} className="text-[#EA4335] shrink-0" />
              <span className="text-[10px] text-[#EA4335] font-mono leading-tight uppercase tracking-tighter">
                {authError}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <div className="w-1 h-1 rounded-full bg-[#EA4335] animate-pulse" />
            <span className="text-[8px] text-[#EA4335]/70 font-mono uppercase tracking-tighter italic">
              Secured by G-AUTH Sentinel Protocol
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Main chat UI ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full max-w-lg mx-auto bg-black/20 backdrop-blur-md border-x border-[#39FF14]/20 relative overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-black/60 border-b border-[#39FF14]/30 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cpu size={20} className="text-[#39FF14] animate-pulse" />
            <div className="absolute -top-1 -right-1">
              <RadarPulse color="#39FF14" />
            </div>
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[#39FF14] tracking-[0.2em] neon-text">
              CIVIQ SENTINEL
            </h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse shadow-[0_0_5px_#39FF14]" />
              <span className="text-[9px] text-[#39FF14]/70 font-mono tracking-widest uppercase">
                Live Status: Active
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-[#39FF14] font-mono font-bold uppercase truncate max-w-[80px]">
              {user.displayName?.split(' ')[0]}
            </span>
            <span className="text-[7px] text-[#9AA0A6] font-mono uppercase tracking-tighter italic">
              ID: {user.uid.slice(0, 8)}...
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="De-authorize"
            className="p-1.5 border border-[#EA4335]/30 bg-[#EA4335]/10 hover:bg-[#EA4335]/20 transition-all active:scale-90"
          >
            <LogOut size={12} className="text-[#EA4335]" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {/* Static welcome message */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-start"
        >
          <div className="max-w-[85%] flex flex-col items-start">
            <div className="flex items-center gap-2 mb-1">
              <Terminal size={12} className="text-[#39FF14]" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-[#39FF14]">
                Sentinel
              </span>
            </div>
            <div className="px-4 py-3 text-[13px] font-mono leading-relaxed bg-black/80 border border-[#39FF14]/40 text-[#FFFFFF] rounded-r-2xl rounded-tl-sm shadow-[0_0_15px_rgba(57,255,20,0.1)] relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] opacity-30 bg-[#39FF14]" />
              <p>
                SYSTEM ONLINE. I am CIVIQ SENTINEL. Provide query for
                real-time crowd intelligence analysis.
              </p>
            </div>
            <span className="text-[8px] text-[#9AA0A6] mt-1 font-mono">
              [BOOT]
            </span>
          </div>
        </motion.div>

        {/* Dynamic messages from useChat */}
        {messages.map((msg: any, idx: number) => {
          const text = getMessageText(msg);
          if (!text) return null;
          return (
            <motion.div
              key={msg.id ?? idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {msg.role !== 'user' && (
                    <Terminal size={12} className="text-[#39FF14]" />
                  )}
                  <span
                    className={`text-[10px] font-bold tracking-widest uppercase ${msg.role === 'user' ? 'text-[#00F0FF]' : 'text-[#39FF14]'}`}
                  >
                    {msg.role === 'user'
                      ? user.displayName?.split(' ')[0] || 'Operator'
                      : 'Sentinel'}
                  </span>
                  {msg.role === 'user' && (
                    <UserIcon size={12} className="text-[#00F0FF]" />
                  )}
                </div>

                <div
                  className={`px-4 py-3 text-[13px] font-mono leading-relaxed shadow-[0_0_20px_rgba(0,0,0,0.3)] transition-all relative overflow-hidden
                    ${msg.role === 'user'
                      ? 'bg-[#00F0FF]/15 border border-[#00F0FF]/40 text-[#FFFFFF] rounded-l-2xl rounded-tr-sm shadow-[0_0_15px_rgba(0,240,255,0.1)]'
                      : 'bg-black/80 border border-[#39FF14]/40 text-[#FFFFFF] rounded-r-2xl rounded-tl-sm shadow-[0_0_15px_rgba(57,255,20,0.1)]'
                    }
                  `}
                >
                  <div
                    className={`absolute top-0 left-0 w-full h-[1px] opacity-30 ${msg.role === 'user' ? 'bg-[#00F0FF]' : 'bg-[#39FF14]'}`}
                  />
                  {msg.role !== 'user' ? (
                    <MarkdownRenderer content={text} />
                  ) : (
                    <p className="relative z-10">{text}</p>
                  )}
                </div>
                <span className="text-[8px] text-[#9AA0A6] mt-1 font-mono">
                  [{new Date().toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}]
                </span>
              </div>
            </motion.div>
          );
        })}

        {/* Loading indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="flex flex-col items-start max-w-[85%]">
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={12} className="text-[#39FF14]" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#39FF14]">
                  Sentinel
                </span>
              </div>
              <div className="bg-black/60 border border-[#39FF14]/30 px-4 py-3 rounded-r-2xl rounded-tl-sm flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#39FF14] animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-[#39FF14] animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-[#39FF14] animate-bounce" />
                </div>
                <span className="text-[11px] text-[#39FF14] italic animate-pulse font-mono tracking-tight">
                  Sentinel is analyzing crowd data...
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error display */}
        {(error || authError) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center my-4"
          >
            <div className="bg-[#EA4335]/10 border border-[#EA4335]/50 px-4 py-2 flex items-center gap-3">
              <AlertCircle size={16} className="text-[#EA4335]" />
              <span className="text-[11px] text-[#EA4335] font-mono font-bold tracking-tight">
                {error ? error.message : authError}
              </span>
              {error && (
                <button
                  onClick={() => { clearError(); regenerate(); }}
                  className="ml-2 p-1 hover:bg-[#EA4335]/20 transition-colors"
                  title="Retry"
                >
                  <RefreshCcw size={14} className="text-[#EA4335]" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-4 bg-black/40 border-t border-[#39FF14]/20 backdrop-blur-xl">
        {/* Quick queries */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 scrollbar-hide no-scrollbar">
          {QUICK_QUERIES.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSend(q)}
              disabled={isLoading}
              className="whitespace-nowrap px-3 py-1.5 bg-black/40 border border-[#39FF14]/30 text-[10px] text-[#39FF14] hover:bg-[#39FF14]/10 transition-all font-mono uppercase tracking-widest active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {q}
            </button>
          ))}
        </div>

        <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query Sentinel..."
              disabled={isLoading}
              className="w-full bg-black/60 border border-[#39FF14]/50 px-4 py-3 text-[13px] text-[#FFFFFF] font-mono focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/30 placeholder-[#39FF14]/30 transition-all disabled:opacity-50"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] text-[#39FF14]/30 font-mono hidden sm:block">
              SYS_INPUT_READY
            </div>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={`p-3 border transition-all active:scale-90 ${!input.trim() || isLoading
                ? 'bg-black/20 border-white/10 text-[#9AA0A6]'
                : 'bg-[#39FF14] border-[#39FF14] text-black shadow-[0_0_15px_#39FF14]'
              }`}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
