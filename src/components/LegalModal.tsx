import React from "react";
import { X, Shield, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "terms" | "privacy";
}

export function LegalModal({ isOpen, onClose, type }: LegalModalProps) {
  const isTerms = type === "terms";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg">
                  {isTerms ? (
                    <FileText className="w-5 h-5 text-indigo-400" />
                  ) : (
                    <Shield className="w-5 h-5 text-indigo-400" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-white">
                  {isTerms ? "Terms of Service" : "Privacy Policy"}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto prose prose-invert prose-sm max-w-none scrollbar-thin scrollbar-thumb-slate-800">
              {isTerms ? (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-white font-bold">1. Acceptance of Terms</h3>
                    <p className="text-slate-400">
                      By accessing or using Bettors Edge, you agree to be bound by these Terms of Service. If you do not agree to all of these terms, do not use our services.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">2. Analysis Disclaimer</h3>
                    <p className="text-slate-400">
                      Bettors Edge provides AI-driven sports analysis and predictions for informational and entertainment purposes only. We do not provide gambling services. We are not responsible for any decisions made based on our predictions.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">3. User Accounts</h3>
                    <p className="text-slate-400">
                      You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">4. Subscription and Payments</h3>
                    <p className="text-slate-400">
                      Certain features of Bettors Edge require a paid subscription. All payments are non-refundable unless otherwise specified.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">5. Intellectual Property</h3>
                    <p className="text-slate-400">
                      All content, features, and functionality of Bettors Edge are the exclusive property of Bettors Edge and its licensors.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">6. Limitation of Liability</h3>
                    <p className="text-slate-400">
                      In no event shall Bettors Edge be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of the service.
                    </p>
                  </section>
                </div>
              ) : (
                <div className="space-y-6">
                  <section>
                    <h3 className="text-white font-bold">1. Information We Collect</h3>
                    <p className="text-slate-400">
                      We collect information you provide directly to us, such as when you create an account, subscribe to our service, or communicate with us. This may include your name, email address, and payment information.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">2. How We Use Your Information</h3>
                    <p className="text-slate-400">
                      We use the information we collect to provide, maintain, and improve our services, to process transactions, and to communicate with you.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">3. Data Security</h3>
                    <p className="text-slate-400">
                      We take reasonable measures to help protect information about you from loss, theft, misuse, and unauthorized access, disclosure, alteration, and destruction.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">4. Third-Party Services</h3>
                    <p className="text-slate-400">
                      We may use third-party services, such as Stripe for payment processing and Google for authentication. These services have their own privacy policies.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">5. Your Choices</h3>
                    <p className="text-slate-400">
                      You may update your account information at any time by logging into your account settings. You may also contact us to request the deletion of your personal information.
                    </p>
                  </section>
                  <section>
                    <h3 className="text-white font-bold">6. Changes to This Policy</h3>
                    <p className="text-slate-400">
                      We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
                    </p>
                  </section>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
