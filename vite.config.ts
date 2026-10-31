import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bridgeMiddlewarePlugin } from './electron/vite-bridge-middleware.mjs';

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const hmrPort = Number(process.env.BASECASE_HMR_PORT) || 0;

export default defineConfig({
  server: {
    watch: { ignored: ['**/library/**', '**/ai-reference/**'] },
    headers: ISOLATION_HEADERS,
    hmr: hmrPort ? { host: 'localhost', clientPort: hmrPort } : undefined,
  },
  preview: { headers: ISOLATION_HEADERS },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), bridgeMiddlewarePlugin()],
});
