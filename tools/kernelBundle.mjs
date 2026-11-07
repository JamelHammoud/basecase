import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = path.join(root, 'electron', 'cad-kernel', 'sandbox');

export const kernelBundleDir = (distDir) => path.join(distDir, 'kernel');

export function buildKernelBundle(distDir) {
  return build({
    configFile: false,
    root,
    logLevel: 'warn',
    publicDir: false,
    build: {
      outDir: kernelBundleDir(distDir),
      emptyOutDir: true,
      target: 'esnext',
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 40000,
      modulePreload: false,
      rollupOptions: {
        input: { host: path.join(sandbox, 'page.mjs'), worker: path.join(sandbox, 'worker.mjs') },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  });
}
