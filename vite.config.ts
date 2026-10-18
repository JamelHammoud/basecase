import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bridgeMiddlewarePlugin } from './electron/vite-bridge-middleware.mjs';

export default defineConfig({
  server: {
    watch: { ignored: ['**/library/**', '**/ai-reference/**'] },
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), bridgeMiddlewarePlugin()],
});
