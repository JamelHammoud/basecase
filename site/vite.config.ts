import tailwindcss from '@tailwindcss/vite';
import babel from '@rolldown/plugin-babel';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(siteDir, '../public');

const HEADERS = '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';

const robotPreviews = () => readdirSync(path.join(publicDir, 'robots')).filter((name) => name.endsWith('.webp'));

const siteAssetsPlugin = (): Plugin => ({
  name: 'basecase-site-assets',
  apply: 'build',
  generateBundle() {
    const files = ['favicon.svg', ...robotPreviews().map((name) => `robots/${name}`)];

    for (const fileName of files) {
      this.emitFile({ type: 'asset', fileName, source: readFileSync(path.join(publicDir, fileName)) });
    }

    this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS });
  },
});

export default defineConfig(({ command }) => ({
  root: siteDir,
  publicDir: command === 'serve' ? publicDir : false,
  build: { outDir: path.join(siteDir, 'dist'), emptyOutDir: true },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), siteAssetsPlugin()],
}));
