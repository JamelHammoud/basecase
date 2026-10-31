#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

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
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString());
  const bin = buf.subarray(28 + jsonLength);
  const view = (accessor) => {
    const a = json.accessors[accessor];
    const bv = json.bufferViews[a.bufferView];
    const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const Type = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    const count = a.count * (a.type === 'VEC3' ? 3 : 1);

    return new Type(bin.buffer.slice(start, start + count * Type.BYTES_PER_ELEMENT));
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

function buildProbe(mesh) {
  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingBox();

  const bvh = new MeshBVH(geometry);
  const box = geometry.boundingBox;
  const k = AXES[axisName];
  const [u, v] = [0, 1, 2].filter((i) => i !== k);
  const point = (a, b, c) => {
    const p = new THREE.Vector3();

    p.setComponent(u, a);
    p.setComponent(v, b);
    p.setComponent(k, c);

    return p;
  };
  const cast = (a, b, fromTop) => {
    const start = point(a, b, fromTop ? box.max.getComponent(k) + 5 : box.min.getComponent(k) - 5);
    const dir = point(0, 0, fromTop ? -1 : 1);
    const hit = bvh.raycastFirst(new THREE.Ray(start, dir), THREE.DoubleSide);

    return hit ? hit.point.getComponent(k) : null;
  };

  return { box, k, u, v, cast };
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

function enclosedMisses(probe, step) {
  const { box, u, v, cast } = probe;
  const nu = Math.ceil((box.max.getComponent(u) - box.min.getComponent(u)) / step);
  const nv = Math.ceil((box.max.getComponent(v) - box.min.getComponent(v)) / step);
  const at = (i, j) => [box.min.getComponent(u) + (i + 0.5) * step, box.min.getComponent(v) + (j + 0.5) * step];
  const miss = Array.from({ length: nu }, (_, i) =>
    Array.from({ length: nv }, (_, j) => cast(...at(i, j), true) === null),
  );
  const seen = new Set();
  const regions = [];

  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      if (!miss[i][j] || seen.has(i * nv + j)) continue;

      const region = flood({ miss, seen, nu, nv }, i, j);

      if (!region.touchesEdge) regions.push(region.cells.map(([a, b]) => at(a, b)));
    }

  return regions;
}

function flood(grid, i0, j0) {
  const { miss, seen, nu, nv } = grid;
  const stack = [[i0, j0]];
  const cells = [];
  let touchesEdge = false;

  seen.add(i0 * nv + j0);

  while (stack.length) {
    const [i, j] = stack.pop();

    cells.push([i, j]);
    touchesEdge ||= i === 0 || j === 0 || i === nu - 1 || j === nv - 1;

    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ]) {
      const open = a >= 0 && b >= 0 && a < nu && b < nv && miss[a][b] && !seen.has(a * nv + b);

      if (!open) continue;

      seen.add(a * nv + b);
      stack.push([a, b]);
    }
  }

  return { cells, touchesEdge };
}

function refineHole(probe, coarse, step) {
  const fine = step / 6;
  const us = coarse.map((p) => p[0]);
  const vs = coarse.map((p) => p[1]);
  let sum = [0, 0];
  let n = 0;

  for (let a = Math.min(...us) - step; a <= Math.max(...us) + step; a += fine)
    for (let b = Math.min(...vs) - step; b <= Math.max(...vs) + step; b += fine) {
      if (probe.cast(a, b, true) !== null) continue;

      sum = [sum[0] + a, sum[1] + b];
      n++;
    }

  const center = [sum[0] / n, sum[1] / n];
  const diameter = 2 * Math.sqrt((n * fine * fine) / Math.PI);
  const ring = diameter / 2 + 0.8;
  const top = probe.cast(center[0] + ring, center[1], true);
  const bottom = probe.cast(center[0] + ring, center[1], false);

  return { center, diameter, faces: [bottom, top] };
}

const file = path.join(root, 'public', 'parts', `${id}.glb`);

if (!fs.existsSync(file)) {
  console.error(`${path.relative(root, file)} doesn't exist. Convert or generate the part first.`);
  process.exit(1);
}

const mesh = readGlb(file);
const probe = buildProbe(mesh);
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
