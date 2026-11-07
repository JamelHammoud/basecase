#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProbe, enclosedMisses, refineHole } from '../../electron/cadImport/holeProbe.mjs';
import { readGlb as readGlbFile, viewBytes } from './meshopt.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const AXES = { x: 0, y: 1, z: 2 };
const SHADES = ' .:-=+*#%@';
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const axisName = args.find((a) => a.startsWith('--axis='))?.slice(7) ?? 'y';
const columns = Number(args.find((a) => a.startsWith('--cols='))?.slice(7) ?? 72);

if (!id || !(axisName in AXES)) {
  console.error('Usage: node tools/parts/probe.mjs <id> [--axis=y|x|z] [--cols=72]');
  process.exit(1);
}

const r2 = (v) => Math.round(v * 100) / 100;

function readGlb(file) {
  const { json, bin } = readGlbFile(fs.readFileSync(file));
  const view = (accessor) => {
    const a = json.accessors[accessor];
    const bytes = Uint8Array.from(viewBytes(json, bin, a.bufferView));
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    const count = a.count * (a.type === 'VEC3' ? 3 : 1);

    return new Type(bytes.buffer, a.byteOffset ?? 0, count);
  };
  const positions = [];
  const indices = [];
  const colors = [];

  for (const prim of json.meshes[0].primitives) {
    const pos = view(prim.attributes.POSITION);
    const idx = view(prim.indices);
    const base = positions.length / 3;

    positions.push(...pos);

    for (const i of idx) indices.push(base + i);

    colors.push({ color: json.materials[prim.material]?.name ?? '?', triangles: idx.length / 3 });
  }

  return { positions, indices, colors, extras: json.meshes[0].extras ?? {} };
}

function heightMap(probe) {
  const { box, u, v, k, cast } = probe;
  const spanU = box.max.getComponent(u) - box.min.getComponent(u);
  const spanV = box.max.getComponent(v) - box.min.getComponent(v);
  const step = spanU / columns;
  const rows = Math.max(1, Math.round(spanV / step / 2));
  const lo = box.min.getComponent(k);
  const hi = box.max.getComponent(k);
  const cells = [];

  for (let r = 0; r < rows; r++) {
    const b = box.max.getComponent(v) - ((r + 0.5) * spanV) / rows;
    const row = [];

    for (let c = 0; c < columns; c++) row.push(cast(box.min.getComponent(u) + (c + 0.5) * step, b, true));

    cells.push(row);
  }

  const shade = (h) => (h === null ? ' ' : SHADES[1 + Math.min(8, Math.floor(((h - lo) / (hi - lo || 1)) * 9))]);

  return { rows, step, lines: cells.map((row) => row.map(shade).join('')) };
}

const file = path.join(root, 'public', 'parts', `${id}.glb`);

if (!fs.existsSync(file)) {
  console.error(`${path.relative(root, file)} doesn't exist. Convert or generate the part first.`);
  process.exit(1);
}

const mesh = readGlb(file);
const probe = buildProbe(mesh, AXES[axisName]);
const names = ['x', 'y', 'z'];
const [U, V, K] = [probe.u, probe.v, probe.k].map((i) => names[i]);

console.log(`${id}: mesh frame (Y up, mm), the frame componentPorts.ts uses`);
console.log(
  `  bbox min ${probe.box.min.toArray().map(r2).join(', ')}  max ${probe.box.max.toArray().map(r2).join(', ')}`,
);
console.log(`  size ${(mesh.extras.size ?? []).join(' × ')} mm, ${mesh.indices.length / 3} triangles`);
console.log(`  colors ${mesh.colors.map((c) => `${c.color} (${c.triangles})`).join(', ')}`);
console.log(
  `  surfaces along ${K} at the centre: top ${r2(probe.cast(0, 0, true))}, bottom ${r2(probe.cast(0, 0, false))}`,
);

const map = heightMap(probe);

console.log(`\nHeight seen from +${K} (${U} → right, ${V} ↑, one column = ${r2(map.step)} mm; darker = higher):`);

for (const line of map.lines) console.log(`  |${line}|`);

const holes = enclosedMisses(probe, Math.max(0.25, map.step / 2)).map((cells) =>
  refineHole(probe, cells, Math.max(0.25, map.step / 2)),
);

console.log(`\nThrough-holes along ${K} (${holes.length}):`);

for (const h of holes)
  console.log(
    `  ${U} ${r2(h.center[0])}, ${V} ${r2(h.center[1])}  Ø${r2(h.diameter)}  faces ${K} ${r2(h.faces[0])} (bottom) / ${r2(h.faces[1])} (top)`,
  );
