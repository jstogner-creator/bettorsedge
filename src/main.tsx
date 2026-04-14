import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

function isChunkLoadError(value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === 'string'
      ? value
      : '';

  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('ChunkLoadError')
  );
}

function reloadOnceForChunkError() {
  const key = 'bettorsedge:chunk-reload-attempted';
  if (sessionStorage.getItem(key) === '1') return false;
  sessionStorage.setItem(key, '1');
  window.location.reload();
  return true;
}

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', { message, source, lineno, colno, error });

  if (isChunkLoadError(error || String(message))) {
    if (reloadOnceForChunkError()) return true;
  }

  const root = document.getElementById('root');
  if (root && root.innerHTML === '') {
    root.innerHTML = `
      <div style="padding: 20px; color: white; background: #0f172a; min-height: 100vh; font-family: sans-serif;">
        <h1 style="color: #f43f5e;">Critical Startup Error</h1>
        <p style="color: #94a3b8;">The application failed to initialize. This is often due to a script error or missing dependency.</p>
        <pre style="background: #020617; padding: 15px; border-radius: 8px; color: #fb7185; overflow: auto;">${message}\n\nStack: ${error?.stack || 'N/A'}</pre>
        <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer;">Reload App</button>
      </div>
    `;
  }
};

window.onunhandledrejection = (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason);

  if (isChunkLoadError(event.reason)) {
    if (reloadOnceForChunkError()) return;
  }

  try {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    import('./services/logger')
      .then(({ logError }) => {
        logError(error, 'UnhandledPromiseRejection').catch(console.error);
      })
      .catch(console.error);
  } catch (e) {
    console.error('Failed to log unhandled rejection:', e);
  }
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Failed to find the root element');
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}