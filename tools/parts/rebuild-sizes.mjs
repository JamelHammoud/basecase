#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dir = path.join(root, 'public', 'parts');
const out = {};

for (const f of fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.glb'))
  .sort()) {
  const buf = fs.readFileSync(path.join(dir, f));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
  const mesh = json.meshes[0];
  const triangles = mesh.primitives.reduce((n, p) => n + json.accessors[p.indices].count / 3, 0);

  out[path.basename(f, '.glb')] = {
    size: mesh.extras.size,
    originOffset: mesh.extras.originOffset,
    triangles,
    bytes: buf.length,
  };
}

fs.writeFileSync(path.join(root, 'src', 'data', 'component-meshes.json'), JSON.stringify(out, null, 1) + '\n');
console.log(
  Object.entries(out)
    .map(([id, s]) => `${id}: ${s.size.join(' × ')} mm`)
    .join('\n'),
);
