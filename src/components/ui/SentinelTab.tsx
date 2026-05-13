'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Cpu, Terminal, AlertCircle, RefreshCcw, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { RadarPulse } from './RadarPulse';
const getSessionId = () => {
  if (typeof window === 'undefined') return ''; // Next.js/SSR safety
  let id = localStorage.getItem('sentinel_session');
  if (!id) {
    id = 'session_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('sentinel_session', id);
  }
  return id;
};
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
      // SentinelTab.tsx update
      const response = await fetch("https://ecology-coasting-who.ngrok-free.dev/webhook/cbcf80b6-cef1-43dc-a0c5-52e94f30cd88", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatInput: text,
          user_lat: lat,
          user_lng: lng,
          session_id: getSessionId()
        })
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
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-[#9AA0A6] font-mono">UPLINK_STABLE</span>
          <span className="text-[8px] text-[#39FF14]/50 font-mono tracking-tighter">SECURE_CHANNEL_v4.2</span>
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
                  {msg.sender === 'user' ? 'Operator' : 'Sentinel'}
                </span>
                {msg.sender === 'user' && <User size={12} className="text-[#00F0FF]" />}
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
