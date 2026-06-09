import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { logError } from './services/logger';

const isProduction = import.meta.env.PROD;

function renderStartupFallback(message: string) {
  const root = document.getElementById('root');
  if (!root || root.innerHTML !== '') return;

  const safeMessage = isProduction
    ? 'The application failed to initialize. Please reload the page or try again later.'
    : message;

  root.innerHTML = `
    <div style="padding: 20px; color: white; background: #0f172a; min-height: 100vh; font-family: sans-serif;">
      <h1 style="color: #f43f5e;">Startup Error</h1>
      <p style="color: #94a3b8;">${safeMessage}</p>
      <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;">Reload App</button>
    </div>
  `;
}

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', { message, source, lineno, colno, error });

  logError(error || new Error(String(message)), 'GlobalError').catch((err) => {
    console.error('[Logger Failure] Could not log global error:', err);
  });

  renderStartupFallback(String(message));
};

window.onunhandledrejection = (event) => {
  const error = event.reason;
  const loggerError = error instanceof Error ? error : new Error(String(error));
  if (!(error instanceof Error)) {
    loggerError.name = 'UnhandledRejection';
  }

  console.error('[CRITICAL] Unhandled Promise Rejection:', loggerError);

  logError(loggerError, 'UnhandledPromiseRejection').catch((err) => {
    console.warn('[Logger] Failed to log unhandled rejection to Firestore:', err);
  });
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Failed to find the root element');
} else {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
