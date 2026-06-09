import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
  },
  // Gemini and OpenAI keys are server-side only. Do not expose them with VITE_ prefixes.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    // HMR may be disabled in embedded AI Studio environments to prevent flickering during edits.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
}));
