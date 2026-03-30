import { useEffect, useState } from "react";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

export function Toast({ message, type = "info", duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    warning: <AlertCircle className="w-5 h-5 text-amber-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />,
  };

  const styles = {
    success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-100",
    error: "bg-red-500/10 border-red-500/20 text-red-100",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-100",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-100",
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm animate-in slide-in-from-top-5 fade-in duration-300 ${styles[type]}`}>
      {icons[type]}
      <p className="text-sm font-medium">{message}</p>
      <button 
        onClick={() => {
          setIsVisible(false);
          setTimeout(onClose, 300);
        }}
        className="ml-2 p-1 hover:bg-white/10 rounded-full transition-colors"
      >
        <X className="w-4 h-4 opacity-70" />
      </button>
    </div>
  );
}
