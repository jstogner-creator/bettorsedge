import React, { useState, useEffect } from "react";
import { X, Key, Shield, CheckCircle, Brain, CreditCard, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile?: any;
  onCancelSubscription?: () => Promise<void>;
  onManageSports?: () => void;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  userProfile, 
  onCancelSubscription,
  onManageSports 
}: SettingsModalProps) {
  const [kalshiKey, setKalshiKey] = useState("");
  const [isKalshiConnected, setIsKalshiConnected] = useState(false);
  
  const [openaiKey, setOpenaiKey] = useState("");
  const [isOpenAIConnected, setIsOpenAIConnected] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("gpt-5-mini");
  const [useOpenAI, setUseOpenAI] = useState(false);

  const [geminiKey, setGeminiKey] = useState("");
  const [isGeminiConnected, setIsGeminiConnected] = useState(false);
  const [geminiModel, setGeminiModel] = useState("gemini-3.1-pro-preview");

  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const storedKalshi = localStorage.getItem("kalshi_api_key");
    if (storedKalshi) {
      setKalshiKey(storedKalshi);
      setIsKalshiConnected(true);
    }
    
    const storedOpenAI = localStorage.getItem("openai_api_key");
    if (storedOpenAI) {
      setOpenaiKey(storedOpenAI);
      setIsOpenAIConnected(true);
    }

    const storedOpenAIModel = localStorage.getItem("openai_model");
    if (storedOpenAIModel) {
      setOpenaiModel(storedOpenAIModel);
    }

    const storedUseOpenAI = localStorage.getItem("use_openai");
    if (storedUseOpenAI === null) {
      // Default to true if key is present but flag is not set
      setUseOpenAI(!!storedOpenAI);
    } else {
      setUseOpenAI(storedUseOpenAI === "true");
    }

    const storedGemini = localStorage.getItem("gemini_api_key");
    if (storedGemini) {
      setGeminiKey(storedGemini);
      setIsGeminiConnected(true);
    }

    const storedGeminiModel = localStorage.getItem("gemini_model");
    if (storedGeminiModel) {
      setGeminiModel(storedGeminiModel);
    }
  }, []);

  const handleConnectKalshi = () => {
    if (kalshiKey.length > 5) {
      setIsKalshiConnected(true);
      localStorage.setItem("kalshi_api_key", kalshiKey);
    }
  };

  const handleDisconnectKalshi = () => {
    setIsKalshiConnected(false);
    setKalshiKey("");
    localStorage.removeItem("kalshi_api_key");
  };

  const handleConnectOpenAI = () => {
    if (openaiKey.length > 10) {
      setIsOpenAIConnected(true);
      localStorage.setItem("openai_api_key", openaiKey);
      localStorage.setItem("openai_model", openaiModel);
      // Reload to re-initialize the AI client
      window.location.reload();
    }
  };

  const handleDisconnectOpenAI = () => {
    setIsOpenAIConnected(false);
    setOpenaiKey("");
    localStorage.removeItem("openai_api_key");
    localStorage.removeItem("openai_model");
    window.location.reload();
  };

  const handleConnectGemini = () => {
    if (geminiKey.length > 10) {
      setIsGeminiConnected(true);
      localStorage.setItem("gemini_api_key", geminiKey);
      localStorage.setItem("gemini_model", geminiModel);
      window.location.reload();
    }
  };

  const handleDisconnectGemini = () => {
    setIsGeminiConnected(false);
    setGeminiKey("");
    localStorage.removeItem("gemini_api_key");
    localStorage.removeItem("gemini_model");
    window.location.reload();
  };

  const handleToggleOpenAI = () => {
    const newValue = !useOpenAI;
    setUseOpenAI(newValue);
    localStorage.setItem("use_openai", newValue.toString());
    window.location.reload();
  };

  const handleCancelClick = async () => {
    if (!onCancelSubscription) return;
    if (!window.confirm("Are you sure you want to cancel your subscription? You will lose access at the end of your current billing period.")) return;
    
    setIsCancelling(true);
    try {
      await onCancelSubscription();
    } finally {
      setIsCancelling(false);
    }
  };

  if (!isOpen) return null;

  const isSubscribed = userProfile?.subscriptionStatus === 'active';
  const subscribedSports = userProfile?.subscribedSports || [];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          <div className="flex justify-between items-center p-6 border-b border-slate-800 sticky top-0 bg-slate-900/95 backdrop-blur z-10">
            <h2 className="text-xl font-bold text-white flex items-center">
              <Shield className="w-5 h-5 text-indigo-400 mr-2" />
              Settings
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-8">
            {/* Subscription Section */}
            <div className="pb-6 border-b border-slate-800">
              <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
                <CreditCard className="w-4 h-4 mr-2 text-indigo-400" />
                Subscription Management
              </h3>

              {isSubscribed ? (
                <div className="space-y-4">
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Active Plan</span>
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[10px] font-bold rounded-full uppercase">Premium</span>
                    </div>
                    <p className="text-sm text-white font-medium">
                      Subscribed to: {subscribedSports.join(", ")}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={onManageSports}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded transition-colors"
                      >
                        Add/Change Sports
                      </button>
                      <button
                        onClick={handleCancelClick}
                        disabled={isCancelling}
                        className="flex-1 border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold py-2 rounded transition-colors flex items-center justify-center"
                      >
                        {isCancelling ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : null}
                        Cancel Subscription
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 text-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-50" />
                  <p className="text-sm text-slate-300 font-medium">No Active Subscription</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4">Subscribe to unlock AI-powered sports analysis and betting edges.</p>
                  <button
                    onClick={onManageSports}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold py-2 rounded-lg transition-colors"
                  >
                    View Plans
                  </button>
                </div>
              )}
            </div>

            {/* Gemini Settings */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
                <Brain className="w-4 h-4 mr-2 text-indigo-400" />
                Gemini API Integration
              </h3>
              
              {isGeminiConnected ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center text-emerald-400">
                  <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Connected to Gemini</p>
                    <p className="text-xs text-emerald-500/80 mt-1">
                      Using {geminiModel}.
                    </p>
                    <div className="mt-3 space-y-2">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-emerald-500/60">Change Model</label>
                      <div className="flex gap-2">
                        <select
                          value={geminiModel}
                          onChange={(e) => setGeminiModel(e.target.value)}
                          className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-2 py-1 text-xs text-emerald-400 focus:outline-none"
                        >
                          <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                          <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                          <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                        </select>
                        <button 
                          onClick={() => {
                            localStorage.setItem("gemini_model", geminiModel);
                            window.location.reload();
                          }}
                          className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-[10px] font-bold uppercase transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={handleDisconnectGemini}
                    className="ml-auto text-xs underline hover:text-emerald-300"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Enter your Gemini API Key to use your own quota and potentially access more powerful models.
                  </p>
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="Enter Gemini API Key"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Preferred Model</label>
                    <select
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="gemini-3-flash-preview">Gemini 3 Flash Preview (Fast)</option>
                      <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Powerful)</option>
                    </select>
                  </div>
                  <button
                    onClick={handleConnectGemini}
                    disabled={geminiKey.length < 10}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg py-2 font-medium transition-colors"
                  >
                    Connect Gemini
                  </button>
                </div>
              )}
            </div>

            {/* OpenAI Settings */}
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
                <Brain className="w-4 h-4 mr-2 text-slate-400" />
                OpenAI Integration (GPT-4o-mini)
              </h3>
              
              {isOpenAIConnected ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center text-emerald-400">
                  <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Connected to OpenAI</p>
                    <p className="text-xs text-emerald-500/80 mt-1">
                      Using {openaiModel}.
                    </p>
                    <div className="mt-3 space-y-2">
                      <label className="text-[10px] uppercase tracking-wider font-bold text-emerald-500/60">Change Model</label>
                      <div className="flex gap-2">
                        <select
                          value={openaiModel}
                          onChange={(e) => setOpenaiModel(e.target.value)}
                          className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-2 py-1 text-xs text-emerald-400 focus:outline-none"
                        >
                          <option value="gpt-5-mini">GPT-5 Mini</option>
                          <option value="gpt-4o-mini">GPT-4o Mini</option>
                          <option value="gpt-5">GPT-5</option>
                          <option value="gpt-4o">GPT-4o</option>
                        </select>
                        <button 
                          onClick={() => {
                            localStorage.setItem("openai_model", openaiModel);
                            window.location.reload();
                          }}
                          className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-[10px] font-bold uppercase transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-emerald-500/10 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-emerald-400">Use OpenAI for Predictions</p>
                        <p className="text-[10px] text-emerald-500/70">Overrides Gemini when enabled.</p>
                      </div>
                      <button
                        onClick={handleToggleOpenAI}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          useOpenAI ? "bg-emerald-500" : "bg-slate-700"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                          useOpenAI ? "left-7" : "left-1"
                        )} />
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={handleDisconnectOpenAI}
                    className="ml-auto text-xs underline hover:text-emerald-300"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Enter your OpenAI API Key to use GPT-4o-mini instead of Gemini for sports predictions.
                  </p>
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-400">Preferred Model</label>
                    <select
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    >
                      <option value="gpt-5-mini">GPT-5 Mini (Newest & Fast)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (Fastest)</option>
                      <option value="gpt-5">GPT-5 (Ultimate Reasoning)</option>
                      <option value="gpt-4o">GPT-4o (Powerful)</option>
                    </select>
                  </div>
                  <button
                    onClick={handleConnectOpenAI}
                    disabled={openaiKey.length < 10}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg py-2 font-medium transition-colors"
                  >
                    Connect OpenAI
                  </button>
                </div>
              )}
            </div>

            {/* Kalshi Settings */}
            <div className="pt-6 border-t border-slate-800">
              <h3 className="text-sm font-medium text-slate-300 mb-4 flex items-center">
                <Key className="w-4 h-4 mr-2 text-slate-400" />
                Kalshi API Integration
              </h3>
              
              {isKalshiConnected ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center text-emerald-400">
                  <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Connected to Kalshi</p>
                    <p className="text-xs text-emerald-500/80 mt-1">
                      Market data integration active.
                    </p>
                  </div>
                  <button 
                    onClick={handleDisconnectKalshi}
                    className="ml-auto text-xs underline hover:text-emerald-300"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Enter your Kalshi API Key to enable real-time market data and hedging suggestions based on live order books.
                  </p>
                  <input
                    type="password"
                    value={kalshiKey}
                    onChange={(e) => setKalshiKey(e.target.value)}
                    placeholder="Enter API Key"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    onClick={handleConnectKalshi}
                    disabled={kalshiKey.length < 5}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg py-2 font-medium transition-colors"
                  >
                    Connect Account
                  </button>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-800">
              <h3 className="text-xs font-mono text-slate-500 uppercase mb-2">App Info</h3>
              <div className="flex justify-between text-sm text-slate-400">
                <span>Version</span>
                <span>1.0.0-beta</span>
              </div>
              <div className="flex justify-between text-sm text-slate-400 mt-1">
                <span>Default Model</span>
                <span>Gemini 3.1 Flash Preview</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
