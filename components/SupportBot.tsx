'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2, Send, MessageCircle } from 'lucide-react';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function SupportBot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: uid(),
      role: 'assistant',
      text: 'Hola, soy Pocky (IA). 🤖\n¿En qué puedo ayudarte hoy?',
      ts: Date.now(),
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ocultar en rutas de admin
  if (pathname?.startsWith('/admin')) {
    return null;
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('pocket_support_bot_state');
      if (!saved) return;
      const parsed = JSON.parse(saved) as { open?: boolean; minimized?: boolean; messages?: Msg[] };
      if (typeof parsed.open === 'boolean') setOpen(parsed.open);
      if (typeof parsed.minimized === 'boolean') setMinimized(parsed.minimized);
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) setMessages(parsed.messages);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('pocket_support_bot_state', JSON.stringify({ open, minimized, messages }));
    } catch {
      // noop
    }
  }, [open, minimized, messages]);

  useEffect(() => {
    if (!open || minimized) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, minimized, messages.length]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    const userMsg: Msg = { id: uid(), role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    // Usar API de IA real con contexto
    try {
      const res = await fetch('/api/chat/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text,
          context: pathname 
        }),
      });
      const data = await res.json();
      
      const replyText = data.reply || 'Ups, tuve un problema de conexión. Intenta de nuevo.';
      const botMsg: Msg = { id: uid(), role: 'assistant', text: replyText, ts: Date.now() + 1 };
      setMessages((prev) => [...prev, botMsg]);
    } catch (error) {
      console.error(error);
      const botMsg: Msg = { id: uid(), role: 'assistant', text: 'Lo siento, no pude procesar tu mensaje en este momento.', ts: Date.now() + 1 };
      setMessages((prev) => [...prev, botMsg]);
    }
  };

  const hasUnreadHint = useMemo(() => {
    return !open;
  }, [open]);

  return (
    <div className="fixed z-[100] bottom-5 right-5 sm:bottom-8 sm:right-8 pointer-events-none">
      <div className="relative pointer-events-auto">
        <AnimatePresence mode="wait">
          {!open ? (
            <motion.button
              key="trigger"
              layoutId="pocky-chat"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setOpen(true);
                setMinimized(false);
              }}
              className="flex items-center justify-center h-16 w-16 rounded-full bg-white/40 backdrop-blur-md border border-white/50 shadow-lg ring-1 ring-black/5 text-brand-pink hover:bg-white/60 transition-all"
            >
               <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-pink opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-brand-pink"></span>
              </span>
              <MessageCircle className="h-8 w-8" />
            </motion.button>
          ) : (
            <motion.div
              key="chat-window"
              layoutId="pocky-chat"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              drag
              dragConstraints={
                windowSize.width > 0
                  ? { left: -windowSize.width + 350, right: 0, top: -windowSize.height + 500, bottom: 0 }
                  : { left: -200, right: 0, top: -500, bottom: 0 }
              }
              dragElastic={0.1}
              dragMomentum={false}
              className={`flex flex-col overflow-hidden bg-white/60 backdrop-blur-2xl shadow-2xl rounded-[2.5rem] w-[340px] sm:w-[380px] ${minimized ? 'h-auto' : 'h-[500px]'} border border-white/40 ring-1 ring-white/50`}
            >
              {/* Header Draggable - Minimalist */}
              <div className="flex items-center justify-between px-5 py-4 cursor-grab active:cursor-grabbing">
                <div className="flex items-center gap-3">
                   <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-brand-pink/80 to-purple-500/80 text-white shadow-lg backdrop-blur-md">
                    <span className="text-xs font-bold">IA</span>
                    <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800/90 text-base tracking-tight">Pocky</h3>
                    <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wider">Asistente Virtual</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <button 
                    onClick={() => setMinimized(!minimized)}
                    className="p-2 rounded-full hover:bg-white/30 text-gray-600 transition-all active:scale-95"
                   >
                     <Minimize2 className="h-4 w-4" />
                   </button>
                   <button 
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-full hover:bg-red-500/10 text-gray-600 hover:text-red-500 transition-all active:scale-95"
                   >
                     <X className="h-4 w-4" />
                   </button>
                </div>
              </div>

              {/* Chat Content */}
              {!minimized && (
                <>
                  <div 
                    ref={listRef} 
                    className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-hide"
                    style={{ maskImage: 'linear-gradient(to bottom, transparent, black 20px)' }}
                  >
                    {messages.map((m) => (
                      <motion.div 
                        key={m.id} 
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                        className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] px-5 py-3 rounded-2xl text-sm shadow-sm backdrop-blur-md ${
                            m.role === 'user'
                              ? 'bg-brand-pink/80 text-white rounded-br-none shadow-brand-pink/20'
                              : 'bg-white/60 text-gray-800 rounded-bl-none border border-white/50 shadow-gray-200/50'
                          }`}
                        >
                          {m.text}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Input Area - Floating Effect */}
                  <div className="p-4 bg-transparent">
                    <form 
                      onSubmit={send} 
                      className="relative flex items-center bg-white/40 backdrop-blur-xl border border-white/60 rounded-full p-1 shadow-lg transition-all focus-within:bg-white/60 focus-within:shadow-xl focus-within:ring-2 focus-within:ring-brand-pink/20"
                    >
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribe aquí..."
                        className="w-full bg-transparent border-none rounded-full py-2.5 pl-4 pr-12 text-sm text-gray-800 placeholder:text-gray-500 focus:ring-0"
                      />
                      <button 
                        type="submit"
                        disabled={!input.trim()}
                        className="absolute right-1.5 p-2 bg-brand-pink text-white rounded-full shadow-md hover:scale-110 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all duration-300"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
