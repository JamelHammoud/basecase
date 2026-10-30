import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ADDONS = [
  { dir: 'electron/native/sharing', fallback: 'AirDrop falls back to the share menu.' },
  { dir: 'electron/native/vision', fallback: 'compare falls back to flood-filling plain backgrounds.' },
];

if (process.platform !== 'darwin') process.exit(0);

const nodeGyp = createRequire(import.meta.url).resolve('node-gyp/bin/node-gyp.js');

for (const addon of ADDONS) {
  const result = spawnSync(process.execPath, [nodeGyp, 'rebuild', '--loglevel=warn'], {
    cwd: path.join(root, addon.dir),
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.warn(`[native] Couldn’t build ${addon.dir}. ${addon.fallback}`);
  }
}
