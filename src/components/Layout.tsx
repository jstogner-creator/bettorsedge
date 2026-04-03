import React, { useState } from "react";
import { Trophy, Calendar, Settings, Activity, LogOut, Shield, FileText, Plus, HelpCircle, Mail, MessageSquare } from "lucide-react";
import { cn } from "../lib/utils";
import { SettingsModal } from "./SettingsModal";
import { LegalModal } from "./LegalModal";
import { logout } from "../firebase";

import { UserProfile } from "../types";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin?: boolean;
  subscribedSports?: string[];
  userProfile?: UserProfile | null;
  onCancelSubscription?: () => Promise<void>;
  onManageSports?: () => void;
  onOpenFAQ?: () => void;
}

export function Layout({ 
  children, 
  activeTab, 
  onTabChange, 
  isAdmin, 
  subscribedSports = [],
  userProfile,
  onCancelSubscription,
  onManageSports,
  onOpenFAQ
}: LayoutProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean; type: "terms" | "privacy" }>({
    isOpen: false,
    type: "terms",
  });

  const ALL_SPORTS = ["NBA", "NFL", "NCAA", "NHL", "MLB"];
  let tabs = [...ALL_SPORTS];
  
  // Filter tabs based on subscription for non-admins
  if (!isAdmin && subscribedSports.length > 0) {
    tabs = tabs.filter(sport => subscribedSports.includes(sport));
    // Add "Add Sport" if there are more sports available to subscribe to
    if (tabs.length < ALL_SPORTS.length) {
      tabs.push("Add Sport");
    }
  }

  if (isAdmin) {
    tabs.push("Accuracy");
    tabs.push("Users");
  }

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-x-hidden">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md md:sticky md:top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg shrink-0">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400 leading-tight">
                Bettors Edge
              </h1>
            </div>
          </div>
          <nav id="league-nav" className="hidden md:flex items-center bg-slate-800/30 p-1 rounded-xl border border-slate-700/30">
            {tabs.map((league) => (
              <button
                key={league}
                onClick={() => onTabChange(league)}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-2",
                  activeTab === league
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                    : league === "Add Sport" 
                      ? "text-amber-500 hover:bg-amber-500/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                )}
              >
                {league === "Add Sport" && <Plus className="w-3 h-3" />}
                {league}
              </button>
            ))}
          </nav>
          <div className="flex items-center space-x-4">
            {isAdmin && (
              <button 
                onClick={() => onTabChange("Admin")}
                className={cn(
                  "p-2 hover:bg-slate-800 rounded-full transition-colors",
                  activeTab === "Admin" ? "text-indigo-400 bg-slate-800" : "text-slate-400 hover:text-white"
                )}
                title="Admin Tools"
              >
                <Shield className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={onOpenFAQ}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-indigo-400"
              title="Help & FAQ"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button 
              onClick={() => handleLogout().catch(console.error)}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-rose-400"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <nav className="md:hidden border-t border-slate-800 px-4 py-2 flex items-center bg-slate-900/80 backdrop-blur-sm overflow-x-auto no-scrollbar gap-2">
          {tabs.map((league) => (
            <button
              key={league}
              onClick={() => onTabChange(league)}
              className={cn(
                "px-4 py-1.5 text-xs font-bold transition-all rounded-lg flex items-center gap-2 whitespace-nowrap",
                activeTab === league
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                  : league === "Add Sport"
                    ? "text-amber-500 hover:bg-amber-500/10"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              )}
            >
              {league === "Add Sport" && <Plus className="w-3 h-3" />}
              {league}
            </button>
          ))}
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-[calc(100vh-160px)]">
        {children}
      </main>

      <footer className="border-t border-slate-800 bg-slate-950 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
          <p className="mb-2 max-w-4xl mx-auto leading-relaxed">
            <strong className="text-slate-400">Analysis Disclaimer:</strong> The predictions, analysis, and scenario insights provided by Bettors Edge are for informational and entertainment purposes only. 
            These are <span className="text-amber-500/80 font-semibold">only predictions and not guarantees</span> of future outcomes. 
            We are not responsible for any decisions made based on our analysis. 
          </p>
          <p>© {new Date().getFullYear()} Bettors Edge. All rights reserved.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <button
              onClick={() => setLegalModal({ isOpen: true, type: "terms" })}
              className="text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <FileText className="w-3 h-3" />
              Terms of Service
            </button>
            <button
              onClick={() => setLegalModal({ isOpen: true, type: "privacy" })}
              className="text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <Shield className="w-3 h-3" />
              Privacy Policy
            </button>
            <a
              href="mailto:support@bettorsedge.ai"
              className="text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <Mail className="w-3 h-3" />
              Contact Us
            </a>
            <a
              href="mailto:support@bettorsedge.ai?subject=Bug%20Report%20/%20Feedback"
              className="text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <MessageSquare className="w-3 h-3" />
              Report a Bug / Feedback
            </a>
          </div>
        </div>
      </footer>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        userProfile={userProfile}
        onCancelSubscription={onCancelSubscription}
        onManageSports={onManageSports}
      />
      <LegalModal 
        isOpen={legalModal.isOpen} 
        onClose={() => setLegalModal({ ...legalModal, isOpen: false })} 
        type={legalModal.type} 
      />
    </div>
  );
}
