import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, type ResolvedConfig } from 'vite';
import { bridgeMiddlewarePlugin } from './electron/vite-bridge-middleware.mjs';
import { buildKernelBundle } from './tools/kernelBundle.mjs';

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

const hmrPort = Number(process.env.BASECASE_HMR_PORT) || 0;

const webEntryPlugin = () => ({
  name: 'basecase-web-entry',
  transformIndexHtml: {
    order: 'pre' as const,
    handler: (html: string) => html.replace('/src/main.tsx', '/src/webMain.ts'),
  },
});

const kernelBundlePlugin = () => {
  let distDir = '';

  return {
    name: 'basecase-kernel-bundle',
    apply: 'build' as const,
    configResolved: (config: ResolvedConfig) => {
      distDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle: async () => {
      await buildKernelBundle(distDir);
    },
  };
};

export default defineConfig(({ mode }) => ({
  server: {
    watch: { ignored: ['**/library/**', '**/ai-reference/**'] },
    headers: ISOLATION_HEADERS,
    hmr: hmrPort ? { host: 'localhost', clientPort: hmrPort } : undefined,
  },
  preview: { headers: ISOLATION_HEADERS },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    ...(mode === 'web' ? [webEntryPlugin()] : [bridgeMiddlewarePlugin(), kernelBundlePlugin()]),
  ],
}));
