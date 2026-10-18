/**
 * Writes a component mesh for the Parts library: centers it on its bounding box (the
 * studio's part origin), merges by color, welds, simplifies only above the triangle budget,
 * and saves public/parts/<id>.glb plus its exact size in src/data/component-meshes.json.
 *
 * Input groups are triangle soups in the studio frame (Y up, mm) with an sRGB color 0–1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const OUT_DIR = path.join(root, 'public', 'parts');
const STATS_FILE = path.join(root, 'src', 'data', 'component-meshes.json');

await MeshoptSimplifier.ready;

/**
 * @param {string} id
 * @param {Array<{ color: number[], soup: number[] }>} groups
 * @param {{ source?: string | null, triangleBudget?: number, simplifyError?: number, colorMap?: Record<string, number[]> }} opts
 */
export function writePartGlb(id, groups, opts = {}) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const g of groups)
    for (let i = 0; i < g.soup.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], g.soup[i + k]);
        max[k] = Math.max(max[k], g.soup[i + k]);
      }
  const center = min.map((v, k) => (v + max[k]) / 2);
  const size = max.map((v, k) => round(v - min[k], 3));
  // Where the source's own origin (its datum) sits relative to the part center
  const originOffset = center.map((c) => round(-c, 3));

  const budget = opts.triangleBudget ?? 120000;
  let total = 0;
  const prims = [];
  for (const g of groups) {
    const soup = g.soup.map((v, i) => v - center[i % 3]);
    const welded = weld(soup);
    if (welded.indices.length === 0) continue;
    total += welded.indices.length / 3;
    prims.push({ color: displayColor(g.color, opts.colorMap), ...welded });
  }
  const sourceTriangles = total;
  if (total > budget) {
    const ratio = budget / total;
    // Max error relative to the part size: 0.0015 of an 85 mm board ≈ 0.13 mm
    const maxError = opts.simplifyError ?? 0.0015;
    total = 0;
    for (const p of prims) {
      const target = Math.max(3, Math.floor((p.indices.length * ratio) / 3) * 3);
      const [out] = MeshoptSimplifier.simplify(p.indices, p.positions, 3, target, maxError, ['LockBorder']);
      const c = compact(out, p.positions);
      p.positions = c.positions;
      p.indices = c.indices;
      total += p.indices.length / 3;
    }
  }

  const glb = writeGlb(prims, { id, source: opts.source ?? null, originOffset, size });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${id}.glb`), glb);
  const stats = fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) : {};
  stats[id] = { size, originOffset, triangles: total, bytes: glb.length };
  fs.writeFileSync(STATS_FILE, JSON.stringify(Object.fromEntries(Object.entries(stats).sort()), null, 1) + '\n');
  return { size, originOffset, triangles: total, sourceTriangles, colors: prims.length, bytes: glb.length };
}

const hex = (c) => c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

/**
 * CAD tools' "no color assigned" defaults aren't the product's finish: show them as neutral
 * grey. A source's "colorMap" ({ "cad1ee": [r, g, b] }) sets real colors per CAD color.
 */
const UNASSIGNED = { cad1ee: [0.74, 0.74, 0.76], '97a3da': [0.74, 0.74, 0.76] }; // SolidWorks / exporter defaults
function displayColor(color, colorMap = {}) {
  const key = hex(color);
  if (colorMap[key]) return colorMap[key];
  // Exporters round the same default slightly differently (97a3da / 98a4dc)
  for (const [k, grey] of Object.entries(UNASSIGNED)) {
    const d = [0, 2, 4].map((i) => Math.abs(parseInt(k.slice(i, i + 2), 16) - parseInt(key.slice(i, i + 2), 16)));
    if (Math.max(...d) <= 3) return grey;
  }
  return color;
}

function round(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

/** Merge coincident vertices (1 µm grid) so the simplifier sees connected surfaces */
function weld(soup) {
  const map = new Map();
  const positions = [];
  const indices = [];
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${Math.round(soup[i] * 1000)},${Math.round(soup[i + 1] * 1000)},${Math.round(soup[i + 2] * 1000)}`;
    let v = map.get(key);
    if (v === undefined) {
      v = positions.length / 3;
      positions.push(soup[i], soup[i + 1], soup[i + 2]);
      map.set(key, v);
    }
    indices.push(v);
  }
  // Drop triangles that collapsed to a line
  const clean = [];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    if (a !== b && b !== c && a !== c) clean.push(a, b, c);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(clean) };
}

/** Drop vertices the simplifier no longer uses */
function compact(indices, positions) {
  const remap = new Map();
  const out = [];
  const idx = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    let v = remap.get(indices[i]);
    if (v === undefined) {
      v = out.length / 3;
      const s = indices[i] * 3;
      out.push(positions[s], positions[s + 1], positions[s + 2]);
      remap.set(indices[i], v);
    }
    idx[i] = v;
  }
  return { positions: new Float32Array(out), indices: idx };
}

function toLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Minimal glTF 2.0 binary: one mesh, one primitive per color */
function writeGlb(prims, extras) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [];
  const accessors = [];
  const push = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    chunks.push(bytes, Buffer.alloc(pad));
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const materials = [];
  const primitives = [];
  for (const p of prims) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p.positions[i + k]);
        max[k] = Math.max(max[k], p.positions[i + k]);
      }
    const vCount = p.positions.length / 3;
    const pv = push(p.positions, 34962);
    accessors.push({ bufferView: pv, componentType: 5126, count: vCount, type: 'VEC3', min, max });
    const posAcc = accessors.length - 1;
    const small = vCount < 65536;
    const iv = push(small ? Uint16Array.from(p.indices) : p.indices, 34963);
    accessors.push({ bufferView: iv, componentType: small ? 5123 : 5125, count: p.indices.length, type: 'SCALAR' });
    const idxAcc = accessors.length - 1;
    const srgb = p.color.slice(0, 3);
    materials.push({
      name: '#' + srgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join(''),
      pbrMetallicRoughness: { baseColorFactor: [...srgb.map(toLinear), 1], metallicFactor: 0, roughnessFactor: 0.6 },
    });
    primitives.push({ attributes: { POSITION: posAcc }, indices: idxAcc, material: materials.length - 1 });
  }
  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'basecase parts pipeline' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: extras.id }],
    meshes: [{ name: extras.id, primitives, extras }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json));
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonBuf.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonBuf, bh, bin]);
}
