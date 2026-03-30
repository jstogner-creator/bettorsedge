import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Global error handling for early detection
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', { message, source, lineno, colno, error });
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
    </StrictMode>,
  );
}
