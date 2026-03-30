export const logger = {
  info: (message: string, data?: any) => {
    console.info(`[INFO] ${new Date().toISOString()}: ${message}`, data || "");
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, data || "");
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, error || "");
    // In a real app, you might send this to an external logging service like Sentry
  },
};
