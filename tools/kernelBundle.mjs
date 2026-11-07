import fs from 'node:fs';
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
    logLevel: 'error',
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

const KERNEL_SOURCES = [path.join(root, 'electron', 'cad-kernel'), path.join(root, 'package-lock.json')];

function newestChange(entry) {
  const stat = fs.statSync(entry);

  if (!stat.isDirectory()) return stat.mtimeMs;

  return Math.max(0, ...fs.readdirSync(entry).map((name) => newestChange(path.join(entry, name))));
}

export async function ensureKernelBundle(distDir) {
  const built = path.join(kernelBundleDir(distDir), 'worker.js');
  const fresh = fs.existsSync(built) && fs.statSync(built).mtimeMs > Math.max(...KERNEL_SOURCES.map(newestChange));

  if (fresh) return;

  console.log('[kernel] Building the CAD kernel bundle…');
  await buildKernelBundle(distDir);
}
