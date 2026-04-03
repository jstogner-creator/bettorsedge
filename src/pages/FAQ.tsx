import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ChevronDown, 
  Search, 
  HelpCircle, 
  TrendingUp, 
  Database, 
  ShieldAlert, 
  Mail,
  ArrowLeft,
  Info,
  Zap,
  BarChart3,
  Clock
} from "lucide-react";

interface FAQItemProps {
  question: string;
  answer: React.ReactNode;
  icon?: React.ReactNode;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, icon }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-slate-800 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-5 flex items-center justify-between text-left hover:bg-slate-900/50 px-4 transition-all rounded-lg group"
      >
        <div className="flex items-center gap-4">
          {icon && <div className="text-indigo-400 group-hover:text-indigo-300 transition-colors">{icon}</div>}
          <span className="text-slate-200 font-medium">{question}</span>
        </div>
        <ChevronDown 
          className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isOpen ? "rotate-180 text-indigo-400" : ""}`} 
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-6 pt-2 text-slate-400 leading-relaxed pl-14">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const FAQ: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [searchQuery, setSearchQuery] = useState("");

  const faqCategories = [
    {
      title: "General Information",
      icon: <Info className="w-5 h-5" />,
      items: [
        {
          question: "What is Bettors Edge?",
          answer: "Bettors Edge is an AI-powered decision engine designed to help sports enthusiasts identify positive expected value (+EV) opportunities. We analyze thousands of data points across team strength, matchups, injuries, and market trends to provide clear, actionable insights.",
          icon: <Zap className="w-4 h-4" />
        },
        {
          question: "Is this financial advice?",
          answer: "No. All information provided by Bettors Edge is for informational and entertainment purposes only. Sports analysis involves significant uncertainty, and you should never make decisions based solely on AI predictions. We provide data-driven analysis, but final decisions are yours.",
          icon: <ShieldAlert className="w-4 h-4" />
        },
        {
          question: "How do I use the dashboard?",
          answer: "The dashboard is organized by league (NBA, MLB, etc.). Each game card shows the matchup, current market odds, our AI-calculated win probability, and the 'Edge' (the difference between our probability and the market's implied probability).",
          icon: <BarChart3 className="w-4 h-4" />
        }
      ]
    },
    {
      title: "Data & Analysis",
      icon: <Database className="w-5 h-5" />,
      items: [
        {
          question: "Where does the game data come from?",
          answer: "We pull real-time schedule, score, and basic team data from ESPN's official APIs. This ensures you're always looking at the most current matchups and results.",
          icon: <Database className="w-4 h-4" />
        },
        {
          question: "How are 'Edge' and 'Win Probability' calculated?",
          answer: "Our engine uses advanced AI models to simulate game outcomes. We consider offensive/defensive ratings, player injuries, rest days, travel fatigue, and historical matchup data. The 'Edge' is the percentage points difference between our calculated probability and what the sportsbook odds imply.",
          icon: <TrendingUp className="w-4 h-4" />
        },
        {
          question: "What are Kalshi and Sportsbook odds?",
          answer: "Kalshi provides prediction market data, which often reflects 'wisdom of the crowd' sentiment. We also pull professional-grade sportsbook odds. Comparing these helps identify where the market might be mispriced.",
          icon: <BarChart3 className="w-4 h-4" />
        }
      ]
    },
    {
      title: "Analysis Strategy",
      icon: <TrendingUp className="w-5 h-5" />,
      items: [
        {
          question: "What does 'Positive Expected Value (+EV)' mean?",
          answer: "An analysis has +EV when the probability of an outcome is higher than the probability implied by market trends. Over the long term, consistently identifying +EV opportunities is the key to accurate sports predictions.",
          icon: <TrendingUp className="w-4 h-4" />
        },
        {
          question: "How should I interpret the 'Confidence Score'?",
          answer: "The Confidence Score (0-100) reflects how much data supports the recommendation. High confidence (85+) means multiple models and situational factors align. Low confidence (<70) usually results in a 'PASS' recommendation due to uncertainty or missing data (like late-breaking injury news).",
          icon: <ShieldAlert className="w-4 h-4" />
        },
        {
          question: "Why are some games marked as 'PASS'?",
          answer: "We only recommend bets when there is a clear, data-backed edge. If the market odds are perfectly efficient, or if there's too much uncertainty (e.g., a star player's status is unknown), our engine defaults to 'PASS' to protect your bankroll.",
          icon: <Clock className="w-4 h-4" />
        }
      ]
    },
    {
      title: "Support & Contact",
      icon: <Mail className="w-5 h-5" />,
      items: [
        {
          question: "How often is the data updated?",
          answer: "Odds and market data are updated every few minutes. AI analysis is re-run whenever significant news (like injury updates) is detected or at regular intervals throughout the day.",
          icon: <Clock className="w-4 h-4" />
        },
        {
          question: "I found a bug or have a feature request, what should I do?",
          answer: "We love feedback! If you encounter any technical issues or have ideas for new features, please reach out so we can improve the experience for everyone.",
          icon: <HelpCircle className="w-4 h-4" />
        },
        {
          question: "Still have questions?",
          answer: (
            <div className="space-y-3">
              <p>If your question wasn't answered here, please feel free to contact our support team directly.</p>
              <div className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-300">
                <Mail className="w-4 h-4" />
                <span className="font-medium">support@bettorsedge.ai</span>
              </div>
              <p className="text-xs text-slate-500 italic">Please allow 24-48 hours for a response to non-urgent inquiries.</p>
            </div>
          ),
          icon: <Mail className="w-4 h-4" />
        }
      ]
    }
  ];

  const filteredCategories = faqCategories.map(cat => ({
    ...cat,
    items: cat.items.filter(item => 
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (typeof item.answer === 'string' && item.answer.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  })).filter(cat => cat.items.length > 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-900 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Help & FAQ
            </h1>
          </div>
          <div className="hidden sm:block text-xs text-slate-500">
            Version 1.2.0
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-6">
            <HelpCircle className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">How can we help?</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Find answers to common questions about the Bettors Edge dashboard, 
            our AI analysis, and how to interpret the data.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl mx-auto mb-16">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
          <input
            type="text"
            placeholder="Search for questions, keywords, or topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-600"
          />
        </div>

        {/* FAQ Content */}
        <div className="space-y-12">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category, idx) => (
              <motion.section 
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-slate-900/30 border border-slate-800/50 rounded-2xl overflow-hidden"
              >
                <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-800 flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    {category.icon}
                  </div>
                  <h3 className="font-bold text-white tracking-tight uppercase text-sm">
                    {category.title}
                  </h3>
                </div>
                <div className="p-2">
                  {category.items.map((item, itemIdx) => (
                    <FAQItem 
                      key={itemIdx}
                      question={item.question}
                      answer={item.answer}
                      icon={item.icon}
                    />
                  ))}
                </div>
              </motion.section>
            ))
          ) : (
            <div className="text-center py-20 bg-slate-900/20 rounded-3xl border border-dashed border-slate-800">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 text-slate-500 mb-4">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-300 mb-2">No results found</h3>
              <p className="text-slate-500">
                We couldn't find any answers matching "{searchQuery}". 
                Try different keywords or browse the categories.
              </p>
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="mt-20 p-8 bg-gradient-to-br from-indigo-600/20 to-cyan-600/20 border border-indigo-500/20 rounded-3xl text-center">
          <h3 className="text-xl font-bold text-white mb-3">Still have questions?</h3>
          <p className="text-slate-400 mb-6 max-w-md mx-auto">
            Our team is here to help you get the most out of Bettors Edge. 
            Drop us an email and we'll get back to you as soon as possible.
          </p>
          <div className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20">
            <Mail className="w-5 h-5" />
            support@bettorsedge.ai
          </div>
        </div>
      </main>
    </div>
  );
};
