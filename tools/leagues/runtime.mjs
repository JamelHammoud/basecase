import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const jiti = createJiti(import.meta.url, {
  alias: { 'manifold-3d/manifold.wasm?url': path.join(ROOT, 'tools/cli/assetUrl.mjs') },
});

export const leagueModule = (file) => jiti.import(path.join(ROOT, 'src/leagues', `${file}.ts`));
export const appModule = (file) => jiti.import(path.join(ROOT, file));
