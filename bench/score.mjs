#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, parseStl, silhouette, writePng } from './geometry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function robustBounds(tris) {
  const pts = sample(tris, 20000);
  const min = [],
    max = [];

  for (let k = 0; k < 3; k++) {
    const v = new Float32Array(pts.length / 3);

    for (let i = 0; i < v.length; i++) v[i] = pts[i * 3 + k];

    v.sort();
    min.push(v[Math.floor(v.length * 0.005)]);
    max.push(v[Math.ceil(v.length * 0.995) - 1]);
  }

  return { min, max, size: max.map((x, k) => x - min[k]) };
}

function normalize(tris) {
  const b = robustBounds(tris);
  const cx = (b.min[0] + b.max[0]) / 2,
    cy = (b.min[1] + b.max[1]) / 2,
    z0 = boundsOf(tris).min[2];
  const out = new Float32Array(tris.length);

  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i] - cx;
    out[i + 1] = tris[i + 1] - cy;
    out[i + 2] = tris[i + 2] - z0;
  }

  return out;
}

const AXIS_PERMUTATIONS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const SIGNS = [-1, 1];

function signedPermutation(p, [sx, sy, sz]) {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];

  m[p[0]] = sx;
  m[3 + p[1]] = sy;
  m[6 + p[2]] = sz;

  return m;
}

const determinant = (m) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);

const CUBE_ROTATIONS = AXIS_PERMUTATIONS.flatMap((p) =>
  SIGNS.flatMap((sx) => SIGNS.flatMap((sy) => SIGNS.map((sz) => signedPermutation(p, [sx, sy, sz])))),
).filter((m) => determinant(m) > 0);

function rotate(tris, m) {
  const out = new Float32Array(tris.length);

  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i],
      y = tris[i + 1],
      z = tris[i + 2];

    out[i] = m[0] * x + m[1] * y + m[2] * z;
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z;
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }

  return out;
}

function yaw(tris, quarterTurns) {
  const out = new Float32Array(tris.length);

  for (let i = 0; i < tris.length; i += 3) {
    let x = tris[i],
      y = tris[i + 1];

    for (let k = 0; k < quarterTurns; k++) [x, y] = [-y, x];

    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = tris[i + 2];
  }

  return out;
}

function iou(a, b) {
  let inter = 0,
    uni = 0;

  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;

    if (a[i] || b[i]) uni++;
  }

  return uni ? inter / uni : 0;
}

function sample(tris, n) {
  const count = tris.length / 9;
  const cum = new Float64Array(count);
  let total = 0;

  for (let t = 0; t < count; t++) {
    const i = t * 9;
    const ux = tris[i + 3] - tris[i],
      uy = tris[i + 4] - tris[i + 1],
      uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i],
      vy = tris[i + 7] - tris[i + 1],
      vz = tris[i + 8] - tris[i + 2];

    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    cum[t] = total;
  }

  const pts = new Float32Array(n * 3);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    return seed / 0x7fffffff;
  };

  for (let s = 0; s < n; s++) {
    const r = rand() * total;
    let lo = 0,
      hi = count - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;

      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }

    let u = rand(),
      v = rand();

    if (u + v > 1) [u, v] = [1 - u, 1 - v];

    const i = lo * 9;

    for (let k = 0; k < 3; k++)
      pts[s * 3 + k] = tris[i + k] + u * (tris[i + 3 + k] - tris[i + k]) + v * (tris[i + 6 + k] - tris[i + k]);
  }

  return pts;
}

const cellKey = (x, y, z) => `${x},${y},${z}`;

function bucketPoints(pts, cell) {
  const grid = new Map();

  for (let i = 0; i < pts.length; i += 3) {
    const k = cellKey(Math.floor(pts[i] / cell), Math.floor(pts[i + 1] / cell), Math.floor(pts[i + 2] / cell));
    const arr = grid.get(k);

    if (arr) arr.push(i);
    else grid.set(k, [i]);
  }

  return grid;
}

function nearestInBucket(a, i, b, arr) {
  let best = Infinity;

  for (const j of arr) {
    const d = Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]);

    if (d < best) best = d;
  }

  return best;
}

function cubeOffsets(r) {
  const offsets = [];

  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) offsets.push([dx, dy, dz]);

  return offsets;
}

const SEARCH_OFFSETS = [1, 2, 3, 4, 5, 6].map(cubeOffsets);

function nearestInShell({ a, i, b, grid, center: [cx, cy, cz], r }) {
  let best = Infinity;

  for (const [dx, dy, dz] of SEARCH_OFFSETS[r - 1]) {
    const arr = grid.get(cellKey(cx + dx, cy + dy, cz + dz));

    if (arr) best = Math.min(best, nearestInBucket(a, i, b, arr));
  }

  return best;
}

function meanNearest(a, b, cell) {
  const grid = bucketPoints(b, cell);
  let sum = 0;

  for (let i = 0; i < a.length; i += 3) {
    const center = [Math.floor(a[i] / cell), Math.floor(a[i + 1] / cell), Math.floor(a[i + 2] / cell)];
    let best = Infinity;

    for (let r = 1; r <= 6 && best === Infinity; r++) best = nearestInShell({ a, i, b, grid, center, r });

    sum += best === Infinity ? cell * 6 : best;
  }

  return sum / (a.length / 3);
}

export function scoreModels(refTris, agentTris, { agentParts, refParts, allOrientations = false } = {}) {
  const agent = normalize(agentTris);
  const ab = boundsOf(agent);
  const abRobust = robustBounds(agent);
  let best = null;
  const candidates = allOrientations ? CUBE_ROTATIONS.length : 4;

  for (let q = 0; q < candidates; q++) {
    const ref = normalize(allOrientations ? rotate(refTris, CUBE_ROTATIONS[q]) : yaw(refTris, q));
    const rb = boundsOf(ref);
    const min = [0, 1, 2].map((k) => Math.min(rb.min[k], ab.min[k]));
    const max = [0, 1, 2].map((k) => Math.max(rb.max[k], ab.max[k]));
    const cell = Math.max(...max.map((v, k) => v - min[k])) / 160;
    const dims = (a, b) => ({ w: Math.ceil((max[a] - min[a]) / cell) + 1, h: Math.ceil((max[b] - min[b]) / cell) + 1 });
    const views = {};

    for (const [view, [a, b]] of Object.entries({ front: [0, 2], side: [1, 2], top: [0, 1] })) {
      const { w, h } = dims(a, b);
      const grid = { min, cell, w, h };
      const r = silhouette(ref, view, grid);
      const g = silhouette(agent, view, grid);

      views[view] = { iou: iou(r, g), w, h, r, g };
    }

    const mean = (views.front.iou + views.side.iou + views.top.iou) / 3;

    if (!best || mean > best.mean) best = { q, ref, rb, rbRobust: robustBounds(ref), views, mean };
  }

  const H = best.rb.size[2];
  const refPts = sample(best.ref, 20000);
  const agentPts = sample(agent, 20000);
  const cell = Math.max(2, H / 60);
  const chamfer = (meanNearest(refPts, agentPts, cell) + meanNearest(agentPts, refPts, cell)) / 2;
  const ratios = [0, 1, 2].map((k) => abRobust.size[k] / best.rbRobust.size[k]);
  const scaleScore = 1 - Math.min(1, Math.abs(Math.log(ratios[2])) / Math.log(2));
  const proportionScore =
    1 -
    Math.min(
      1,
      (Math.abs(Math.log(ratios[0] / ratios[2])) + Math.abs(Math.log(ratios[1] / ratios[2]))) / 2 / Math.log(2),
    );
  const chamferScore = 1 - Math.min(1, chamfer / (0.1 * H));
  const shape = 0.4 * best.mean + 0.15 * scaleScore + 0.1 * proportionScore + 0.25 * chamferScore;
  const total = (100 * shape) / 0.9;

  return {
    total: Math.round(total * 10) / 10,
    silhouetteIoU: {
      front: +best.views.front.iou.toFixed(3),
      side: +best.views.side.iou.toFixed(3),
      top: +best.views.top.iou.toFixed(3),
      mean: +best.mean.toFixed(3),
    },
    chamferMm: +chamfer.toFixed(1),
    chamferPctOfHeight: +((chamfer / H) * 100).toFixed(1),
    sizeMm: { agent: abRobust.size.map(Math.round), real: best.rbRobust.size.map(Math.round) },
    sizeRatio: ratios.map((r) => +r.toFixed(2)),
    parts: { agent: agentParts ?? null, real: refParts ?? null },
    refYawQuarterTurns: best.q,
    views: best.views,
  };
}

const OVERLAY_BACKGROUND = [18, 18, 21];
const OVERLAY_BOTH = [235, 235, 235];
const OVERLAY_REF = [40, 140, 255];
const OVERLAY_AGENT = [217, 119, 87];

function overlayColor(inRef, inAgent) {
  if (inRef && inAgent) return OVERLAY_BOTH;

  return inRef ? OVERLAY_REF : OVERLAY_AGENT;
}

function paintView(rgb, { view, ox, pad, W }) {
  const { w, h, r, g } = view;

  for (let i = 0; i < w * h; i++) {
    if (!r[i] && !g[i]) continue;

    const x = i % w,
      y = (i - x) / w;

    rgb.set(overlayColor(r[i], g[i]), ((y + pad) * W + (x + ox)) * 3);
  }
}

export function writeOverlay(file, views) {
  const pad = 8;
  const order = ['front', 'side', 'top'];
  const W = order.reduce((s, v) => s + views[v].w + pad, pad);
  const Hh = Math.max(...order.map((v) => views[v].h)) + 2 * pad;
  const rgb = Buffer.alloc(W * Hh * 3);

  for (let i = 0; i < W * Hh; i++) rgb.set(OVERLAY_BACKGROUND, i * 3);

  let ox = pad;

  for (const v of order) {
    paintView(rgb, { view: views[v], ox, pad, W });
    ox += views[v].w + pad;
  }

  writePng(file, W, Hh, rgb);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [robot, agentFile, agentParts, outDir] = process.argv.slice(2);
  const dataDir = path.join(here, 'data', robot);
  const refTris = parseStl(fs.readFileSync(path.join(dataDir, 'reference.stl')));
  const refMeta = JSON.parse(fs.readFileSync(path.join(dataDir, 'reference.json'), 'utf8'));
  const agentTris = agentFile === 'self' ? refTris : parseStl(fs.readFileSync(agentFile));
  const s = scoreModels(refTris, agentTris, {
    agentParts: agentParts ? +agentParts : undefined,
    refParts: refMeta.parts,
  });
  const dir = outDir || path.dirname(agentFile === 'self' ? path.join(dataDir, 'x') : agentFile);

  writeOverlay(path.join(dir, 'overlay.png'), s.views);

  const { views, ...summary } = s;

  void views;
  fs.writeFileSync(path.join(dir, 'score.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary));
}
