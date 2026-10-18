#!/usr/bin/env node
/**
 * Scores an agent-built model against the real robot.
 *
 *   node bench/score.mjs <robot> <agent.stl> [agentParts] [out-dir]
 *
 * Both models are put on the floor and centered; the reference is tried at four yaw angles
 * (robots don't share a "forward" axis) and the best match is kept. Metrics:
 * - silhouette IoU (front / side / top), the shape a camera sees
 * - Chamfer distance between surfaces, in mm and as % of height
 * - scale ratios (height, width, depth) of the robust surface extent (thin wires don't count)
 * - part count ratio
 * Writes score.json and overlay.png (blue = real only, orange = agent only, white = both).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, parseStl, silhouette, writePng } from './geometry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extent of where the surface really is: 0.5–99.5 percentiles of area-weighted samples,
 * so a 1 mm antenna wire or cable doesn't count as the robot's size.
 */
function robustBounds(tris) {
  const pts = sample(tris, 20000);
  const min = [], max = [];
  for (let k = 0; k < 3; k++) {
    const v = new Float32Array(pts.length / 3);
    for (let i = 0; i < v.length; i++) v[i] = pts[i * 3 + k];
    v.sort();
    min.push(v[Math.floor(v.length * 0.005)]);
    max.push(v[Math.ceil(v.length * 0.995) - 1]);
  }
  return { min, max, size: max.map((x, k) => x - min[k]) };
}

/** Centered on the surface's robust x/y center, standing on its lowest point */
function normalize(tris) {
  const b = robustBounds(tris);
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, z0 = boundsOf(tris).min[2];
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i] - cx;
    out[i + 1] = tris[i + 1] - cy;
    out[i + 2] = tris[i + 2] - z0;
  }
  return out;
}

/** The 24 rotations of a cube (proper axis permutations with signs) as row-major 3×3 */
const CUBE_ROTATIONS = (() => {
  const out = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const p of perms) for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) for (let sz = -1; sz <= 1; sz += 2) {
    const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    m[p[0]] = sx;
    m[3 + p[1]] = sy;
    m[6 + p[2]] = sz;
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    if (det > 0) out.push(m);
  }
  return out;
})();

function rotate(tris, m) {
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    out[i] = m[0] * x + m[1] * y + m[2] * z;
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z;
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z;
  }
  return out;
}

function yaw(tris, quarterTurns) {
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    let x = tris[i], y = tris[i + 1];
    for (let k = 0; k < quarterTurns; k++) [x, y] = [-y, x];
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = tris[i + 2];
  }
  return out;
}

function iou(a, b) {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
  }
  return uni ? inter / uni : 0;
}

/** Area-weighted random surface samples */
function sample(tris, n) {
  const count = tris.length / 9;
  const cum = new Float64Array(count);
  let total = 0;
  for (let t = 0; t < count; t++) {
    const i = t * 9;
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    total += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    cum[t] = total;
  }
  const pts = new Float32Array(n * 3);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let s = 0; s < n; s++) {
    const r = rand() * total;
    let lo = 0, hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    let u = rand(), v = rand();
    if (u + v > 1) [u, v] = [1 - u, 1 - v];
    const i = lo * 9;
    for (let k = 0; k < 3; k++) pts[s * 3 + k] = tris[i + k] + u * (tris[i + 3 + k] - tris[i + k]) + v * (tris[i + 6 + k] - tris[i + k]);
  }
  return pts;
}

/** Mean nearest-neighbor distance from a to b (spatial hash) */
function meanNearest(a, b, cell) {
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < b.length; i += 3) {
    const k = key(Math.floor(b[i] / cell), Math.floor(b[i + 1] / cell), Math.floor(b[i + 2] / cell));
    let arr = grid.get(k);
    if (!arr) grid.set(k, (arr = []));
    arr.push(i);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 3) {
    const cx = Math.floor(a[i] / cell), cy = Math.floor(a[i + 1] / cell), cz = Math.floor(a[i + 2] / cell);
    let best = Infinity;
    for (let r = 1; r <= 6 && best === Infinity; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const arr = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (!arr) continue;
        for (const j of arr) {
          const d = Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]);
          if (d < best) best = d;
        }
      }
    }
    sum += best === Infinity ? cell * 6 : best;
  }
  return sum / (a.length / 3);
}

/**
 * allOrientations: try all 24 axis-aligned orientations of the reference (single parts can
 * lie any way up); otherwise the 4 yaw turns (robots stand on the floor).
 */
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
  const proportionScore = 1 - Math.min(1, (Math.abs(Math.log(ratios[0] / ratios[2])) + Math.abs(Math.log(ratios[1] / ratios[2]))) / 2 / Math.log(2));
  const chamferScore = 1 - Math.min(1, chamfer / (0.1 * H));
  // Part count is reported but not scored: URDFs merge each link into one mesh (13 for Berkeley,
  // 161 tiny ones for Reachy), so matching it would punish real fasteners and catalog parts.
  // Weights: silhouettes 4/9, scale 1/6, proportions 1/9, surface distance 5/18.
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

export function writeOverlay(file, views) {
  const pad = 8;
  const order = ['front', 'side', 'top'];
  const W = order.reduce((s, v) => s + views[v].w + pad, pad);
  const Hh = Math.max(...order.map((v) => views[v].h)) + 2 * pad;
  const rgb = Buffer.alloc(W * Hh * 3);
  for (let i = 0; i < W * Hh; i++) rgb.set([18, 18, 21], i * 3);
  let ox = pad;
  for (const v of order) {
    const { w, h, r, g } = views[v];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = r[y * w + x], b = g[y * w + x];
      if (!a && !b) continue;
      const color = a && b ? [235, 235, 235] : a ? [40, 140, 255] : [217, 119, 87];
      const idx = ((y + pad) * W + (x + ox)) * 3;
      rgb.set(color, idx);
    }
    ox += w + pad;
  }
  writePng(file, W, Hh, rgb);
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [robot, agentFile, agentParts, outDir] = process.argv.slice(2);
  const dataDir = path.join(here, 'data', robot);
  const refTris = parseStl(fs.readFileSync(path.join(dataDir, 'reference.stl')));
  const refMeta = JSON.parse(fs.readFileSync(path.join(dataDir, 'reference.json'), 'utf8'));
  const agentTris = agentFile === 'self' ? refTris : parseStl(fs.readFileSync(agentFile));
  const s = scoreModels(refTris, agentTris, { agentParts: agentParts ? +agentParts : undefined, refParts: refMeta.parts });
  const dir = outDir || path.dirname(agentFile === 'self' ? path.join(dataDir, 'x') : agentFile);
  writeOverlay(path.join(dir, 'overlay.png'), s.views);
  const { views, ...summary } = s;
  void views;
  fs.writeFileSync(path.join(dir, 'score.json'), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary));
}
