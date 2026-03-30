import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageSquare, X, Send, Loader2, User, Bot, ChevronDown, Zap, Activity, Trophy } from 'lucide-react';
import { ChatMessage, Game, Prediction } from '../types';
import { sportsOracle } from '../services/gemini';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

interface ChatPanelProps {
  games: Game[];
  predictions: Record<string, Prediction>;
}

export function ChatPanel({ games, predictions }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'initial',
      role: 'assistant',
      content: "I'm Snark. I analyze the numbers, find the edge, and tell it like it is. What do you want to know?",
      timestamp: new Date().toISOString(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleSnarkPrompt = (e: any) => {
      const { message } = e.detail;
      setIsOpen(true);
      setInput(message);
      // We don't auto-send because the user might want to edit it, 
      // but we could if we wanted to.
    };

    window.addEventListener('snark-chat-prompt', handleSnarkPrompt);
    return () => window.removeEventListener('snark-chat-prompt', handleSnarkPrompt);
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await sportsOracle.chat(input, history, { games, predictions });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat failed:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to connect to Snark.'}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="chat-panel" className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-16 right-0 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Snark</h3>
                  <p className="text-[10px] text-amber-500/70 uppercase tracking-widest font-mono">Game Insight Engine</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
              {messages.length === 1 && (
                <div className="flex flex-col items-center justify-center text-center p-8 mt-4">
                  <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_-10px_rgba(245,158,11,0.3)]">
                    <Trophy className="w-8 h-8 text-amber-500" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-3">Consult Snark</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Ask about specific matchups, injury impacts, or betting value. I have the data, you just need to ask.
                  </p>
                  <div className="mt-8 grid grid-cols-1 gap-2 w-full">
                    {['"Who has the edge in the Lakers game?"', '"Analyze the injury impact for the Celtics"', '"Find me a high-value underdog today"'].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setInput(suggestion.replace(/"/g, ''))}
                        className="text-left p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300 hover:bg-slate-800 hover:border-amber-500/30 transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center",
                    message.role === 'user' ? "bg-amber-600" : "bg-slate-800"
                  )}>
                    {message.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Zap className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-2xl text-sm shadow-lg",
                    message.role === 'user' 
                      ? "bg-amber-600 text-white rounded-tr-none" 
                      : "bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-none"
                  )}>
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-slate-900/50">
              <div className="relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:hover:bg-amber-600 text-white rounded-lg transition-all"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "group relative flex items-center gap-3 px-4 h-14 rounded-2xl shadow-2xl transition-all duration-300",
          isOpen ? "bg-slate-800 text-white" : "bg-amber-600 text-white"
        )}
      >
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
        )}
        
        <div className={cn(
          "flex items-center justify-center transition-transform duration-300",
          isOpen && "rotate-90"
        )}>
          {isOpen ? <ChevronDown className="w-6 h-6" /> : <Zap className="w-6 h-6 fill-current" />}
        </div>
        
        {!isOpen && (
          <span className="text-sm font-bold tracking-tight whitespace-nowrap pr-2">
            Ask Snark
          </span>
        )}
      </motion.button>
    </div>
  );
}
