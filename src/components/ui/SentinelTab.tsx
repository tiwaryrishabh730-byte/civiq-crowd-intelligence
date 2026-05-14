'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Cpu, Terminal, AlertCircle, RefreshCcw, User as UserIcon, LogOut, LogIn, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { RadarPulse } from './RadarPulse';
import { auth } from '@/lib/firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';

const ADMIN_UID_PLACEHOLDER = "YOUR_ADMIN_UID_HERE"; // Replace with your actual Firebase UID later
interface Message {
  sender: 'user' | 'sentinel';
  text: string;
  timestamp: number;
}

interface SentinelTabProps {
  coordinates: { lat: number; lng: number } | null;
}

const QUICK_QUERIES = [
  "Is CST Busy?",
  "Nearest Station Status",
  "Wait Time Report"
];

export function SentinelTab({ coordinates }: SentinelTabProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'sentinel',
      text: "SYSTEM ONLINE. I am CIVIQ SENTINEL. Provide query for real-time crowd intelligence analysis.",
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    if (!auth) {
      console.error("Firebase Auth not initialized. Check your config.");
      setError("Uplink Error: Auth System Offline");
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      setError(null); // Clear previous errors
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error("CIVIQ AUTH ERROR:", {
        code: err.code,
        message: err.message,
        email: err.customData?.email,
        credential: GoogleAuthProvider.credentialFromError(err)
      });
      setError(`Access Denied: ${err.message}`);
    }
  };

  const handleLogout = () => {
    if (auth) signOut(auth);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      sender: 'user',
      text,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const lat = coordinates?.lat || 0;
      const lng = coordinates?.lng || 0;

      // Comprehensive Local/Admin Check
      const isLocalHost = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      let finalSessionId = user?.uid || 'anonymous_session';

      if (isLocalHost || user?.uid === ADMIN_UID_PLACEHOLDER) {
        finalSessionId = 'operator_rishabh_77';
      }

      const payload = {
        chatInput: text,
        user_lat: lat,
        user_lng: lng,
        session_id: finalSessionId,
        user_name: user?.displayName || 'Authorized Operator'
      };

      console.log("SENTINEL_UPLINK_PAYLOAD:", payload);

      const response = await fetch("https://civiq-backend.onrender.com/webhook/cbcf80b6-cef1-43dc-a0c5-52e94f30cd88", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(response.status === 503 || response.status === 404
          ? "Sentinel is temporarily over-capacity or workflow is inactive. Check n8n."
          : `Uplink failed. Node Status: ${response.status}`);
      }

      const textResponse = await response.text();

      if (!textResponse || textResponse.trim() === "") {
        throw new Error("Sentinel returned an empty signal. Check backend configuration.");
      }

      let data;
      try {
        data = JSON.parse(textResponse);
      } catch (e) {
        console.error("JSON Parse Error:", textResponse);
        throw new Error("Failed to decode Sentinel data. Output format mismatch.");
      }

      // n8n often returns an array [ { output: '...' } ] or a single object { output: '...' }
      const finalData = Array.isArray(data) ? data[0] : data;
      const aiOutput = finalData?.output || finalData?.message || (typeof finalData === 'string' ? finalData : "Signal decoded but content is empty.");

      const sentinelMessage: Message = {
        sender: 'sentinel',
        text: aiOutput,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, sentinelMessage]);
    } catch (err: any) {
      setError(err.message || "Sentinel is temporarily over-capacity. Please try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  const highlightResponse = (text: string) => {
    // Split by HIGH and LOW but keep them in the array
    const parts = text.split(/(HIGH|LOW)/g);
    return parts.map((part, index) => {
      if (part === 'HIGH') {
        return <span key={index} className="text-[#EA4335] font-bold drop-shadow-[0_0_8px_rgba(234,67,53,0.5)]">HIGH</span>;
      }
      if (part === 'LOW') {
        return <span key={index} className="text-[#39FF14] font-bold drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">LOW</span>;
      }
      return part;
    });
  };

  // Custom component to handle highlighting within Markdown
  const MarkdownRenderer = ({ content }: { content: string }) => {
    return (
      <ReactMarkdown
        components={{
          p: ({ children }) => {
            if (typeof children === 'string') {
              return <p className="mb-2 last:mb-0">{highlightResponse(children)}</p>;
            }
            // If children is an array (which it often is with bolding etc)
            const processedChildren = Array.isArray(children)
              ? children.map((child, i) => typeof child === 'string' ? highlightResponse(child) : child)
              : children;
            return <p className="mb-2 last:mb-0">{processedChildren}</p>;
          },
          strong: ({ children }) => (
            <strong className="text-[#00F0FF] font-bold">{children}</strong>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] w-full max-w-lg mx-auto bg-black/20 backdrop-blur-md border-x border-[#39FF14]/20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#39FF14 1px, transparent 1px), linear-gradient(90deg, #39FF14 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
        <RefreshCcw className="text-[#39FF14] animate-spin mb-4" size={32} />
        <span className="text-[#39FF14] font-mono text-xs tracking-widest uppercase animate-pulse">Initializing Neural Link...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-140px)] w-full max-w-lg mx-auto bg-black/20 backdrop-blur-md border-x border-[#39FF14]/20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#39FF14 1px, transparent 1px), linear-gradient(90deg, #39FF14 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

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
            <h2 className="text-xl font-bold text-[#39FF14] tracking-[0.3em] uppercase neon-text mb-2">CIVIQ SENTINEL</h2>
            <p className="text-[10px] text-[#9AA0A6] font-mono tracking-wider max-w-[240px] uppercase">
              Uplink Forbidden. Secure Identity Token Required to Access Tactical Intelligence.
            </p>
          </div>

          <button
            onClick={handleLogin}
            className="flex items-center gap-3 px-6 py-3 bg-[#39FF14] text-black font-bold text-[11px] tracking-[0.2em] uppercase hover:shadow-[0_0_20px_#39FF14] transition-all active:scale-95 group"
          >
            <LogIn size={16} className="group-hover:translate-x-1 transition-transform" />
            Authorize Operator Profile
          </button>

          {error && (
            <div className="p-3 bg-[#EA4335]/10 border border-[#EA4335]/30 flex items-center gap-3 max-w-[280px]">
              <AlertCircle size={16} className="text-[#EA4335] shrink-0" />
              <span className="text-[10px] text-[#EA4335] font-mono leading-tight uppercase tracking-tighter">{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-2">
            <div className="w-1 h-1 rounded-full bg-[#EA4335] animate-pulse" />
            <span className="text-[8px] text-[#EA4335]/70 font-mono uppercase tracking-tighter italic">Secured by G-AUTH Sentinel Protocol</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full max-w-lg mx-auto bg-black/20 backdrop-blur-md border-x border-[#39FF14]/20 relative overflow-hidden">
      {/* Sentinel Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-black/60 border-b border-[#39FF14]/30 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cpu size={20} className="text-[#39FF14] animate-pulse" />
            <div className="absolute -top-1 -right-1">
              <RadarPulse color="#39FF14" />
            </div>
          </div>
          <div>
            <h2 className="text-[14px] font-bold text-[#39FF14] tracking-[0.2em] neon-text">CIVIQ SENTINEL</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#39FF14] animate-pulse shadow-[0_0_5px_#39FF14]" />
              <span className="text-[9px] text-[#39FF14]/70 font-mono tracking-widest uppercase">Live Status: Active</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-[#39FF14] font-mono font-bold uppercase truncate max-w-[80px]">{user.displayName?.split(' ')[0]}</span>
            <span className="text-[7px] text-[#9AA0A6] font-mono uppercase tracking-tighter italic">ID: {user.uid.slice(0, 8)}...</span>
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1">
                {msg.sender === 'sentinel' && <Terminal size={12} className="text-[#39FF14]" />}
                <span className={`text-[10px] font-bold tracking-widest uppercase ${msg.sender === 'user' ? 'text-[#00F0FF]' : 'text-[#39FF14]'}`}>
                  {msg.sender === 'user' ? (user.displayName?.split(' ')[0] || 'Operator') : 'Sentinel'}
                </span>
                {msg.sender === 'user' && <UserIcon size={12} className="text-[#00F0FF]" />}
              </div>

              <div className={`px-4 py-3 text-[13px] font-mono leading-relaxed shadow-lg transition-all
                ${msg.sender === 'user'
                  ? 'bg-[#00F0FF]/10 border border-[#00F0FF]/30 text-[#FFFFFF] rounded-l-2xl rounded-tr-sm'
                  : 'bg-black/60 border border-[#39FF14]/30 text-[#FFFFFF] rounded-r-2xl rounded-tl-sm'
                }
              `}>
                {msg.sender === 'sentinel' ? (
                  <MarkdownRenderer content={msg.text} />
                ) : (
                  <p>{msg.text}</p>
                )}
              </div>
              <span className="text-[8px] text-[#9AA0A6] mt-1 font-mono">
                [{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
              </span>
            </div>
          </motion.div>
        ))}

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
            <div className="flex flex-col items-start max-w-[85%]">
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={12} className="text-[#39FF14]" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#39FF14]">Sentinel</span>
              </div>
              <div className="bg-black/60 border border-[#39FF14]/30 px-4 py-3 rounded-r-2xl rounded-tl-sm flex items-center gap-3">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#39FF14] animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#39FF14] animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#39FF14] animate-bounce"></span>
                </div>
                <span className="text-[11px] text-[#39FF14] italic animate-pulse font-mono tracking-tight">Sentinel is analyzing crowd data...</span>
              </div>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center my-4">
            <div className="bg-[#EA4335]/10 border border-[#EA4335]/50 px-4 py-2 flex items-center gap-3">
              <AlertCircle size={16} className="text-[#EA4335]" />
              <span className="text-[11px] text-[#EA4335] font-mono font-bold tracking-tight">{error}</span>
              <button onClick={() => handleSendMessage(messages[messages.length - 1].text)} className="ml-2 p-1 hover:bg-[#EA4335]/20 transition-colors">
                <RefreshCcw size={14} className="text-[#EA4335]" />
              </button>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-black/40 border-t border-[#39FF14]/20 backdrop-blur-xl">
        {/* Quick Queries */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-1 scrollbar-hide no-scrollbar">
          {QUICK_QUERIES.map((q, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(q)}
              className="whitespace-nowrap px-3 py-1.5 bg-black/40 border border-[#39FF14]/30 text-[10px] text-[#39FF14] hover:bg-[#39FF14]/10 transition-all font-mono uppercase tracking-widest active:scale-95"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query Sentinel..."
              className="w-full bg-black/60 border border-[#39FF14]/50 px-4 py-3 text-[13px] text-[#FFFFFF] font-mono focus:outline-none focus:border-[#39FF14] focus:ring-1 focus:ring-[#39FF14]/30 placeholder-[#39FF14]/30 transition-all"
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
