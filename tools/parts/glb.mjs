import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPartGlb } from '../../electron/cadImport/partGlb.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const OUT_DIR = path.join(root, 'public', 'parts');
const STATS_FILE = path.join(root, 'src', 'data', 'component-meshes.json');

export function writePartGlb(id, groups, opts = {}) {
  const { glb, ...result } = buildPartGlb(id, groups, opts);
  const { size, originOffset, triangles } = result;
  const outDir = opts.outDir ?? OUT_DIR;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${id}.glb`), glb);

  if (opts.stats !== false) writeStats(id, { size, originOffset, triangles, bytes: glb.length });

  return result;
}

function writeStats(id, entry) {
  const stats = fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) : {};

  stats[id] = entry;
  fs.writeFileSync(STATS_FILE, JSON.stringify(Object.fromEntries(Object.entries(stats).sort()), null, 1) + '\n');
}
