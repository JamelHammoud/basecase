import type * as THREE from 'three';
import { poseGap, solve6, symmetricEigen, twist, untwist } from './mapMath';
import type { Voxels } from './voxels';

const MATCH_POINTS = 600;
const FLAT_MATCH_POINTS = 180;
const ITERATIONS = 12;
const MIN_ROWS = 24;
const THIN = 0.08;
const SPREAD = 0.2;
const SETTLED = 1e-6;
const PRIOR = 0.01;
const MAX_JUMP_M = 0.5;
const MAX_TURN_RAD = 0.35;
const REACH_VOXELS = 1.5;

const MIN_CELLS = 4;
const NO_STRUCTURE: Structure = { anchor: [0, 0, 0], normals: [] };

export interface Structure {
  anchor: [number, number, number];
  normals: number[];
}

const scratch = new Float64Array(3);

const OFFSETS = Array.from({ length: 27 }, (_, i) => [(i % 3) - 1, (Math.floor(i / 3) % 3) - 1, Math.floor(i / 9) - 1]);

function around(voxels: Voxels, q: ArrayLike<number>, found: Int32Array): number {
  const cx = voxels.cell(q[0]);
  const cy = voxels.cell(q[1]);
  const cz = voxels.cell(q[2]);

  let count = 0;

  for (const [dx, dy, dz] of OFFSETS) {
    const n = voxels.at(cx + dx, cy + dy, cz + dz);

    if (n >= 0) found[count++] = n;
  }

  return count;
}

function covariance(voxels: Voxels, cells: Int32Array, count: number) {
  const mean = [0, 0, 0];
  const m = [0, 0, 0, 0, 0, 0];

  for (let i = 0; i < count; i++) {
    voxels.centroid(cells[i], scratch);

    const x = scratch[0] - mean[0];
    const y = scratch[1] - mean[1];
    const z = scratch[2] - mean[2];
    const weight = 1 / (i + 1);

    mean[0] += x * weight;
    mean[1] += y * weight;
    mean[2] += z * weight;

    m[0] += x * (scratch[0] - mean[0]);
    m[1] += x * (scratch[1] - mean[1]);
    m[2] += x * (scratch[2] - mean[2]);
    m[3] += y * (scratch[1] - mean[1]);
    m[4] += y * (scratch[2] - mean[2]);
    m[5] += z * (scratch[2] - mean[2]);
  }

  return { mean: mean as [number, number, number], m };
}

function horizontalStructure(anchor: Structure['anchor'], m: number[]): Structure | null {
  const trace = m[0] + m[3];

  if (m[5] > trace * 1e-12) return null;

  const gap = Math.hypot(m[0] - m[3], 2 * m[1]);
  const low = Math.max(0, (trace - gap) / 2);
  const high = (trace + gap) / 2;
  const line = low < THIN * high;

  if (!line && low < SPREAD * high) return NO_STRUCTURE;

  if (!line) return { anchor, normals: [0, 0, 1] };

  const angle = Math.atan2(2 * m[1], m[0] - m[3]) / 2;

  return { anchor, normals: [0, 0, 1, -Math.sin(angle), Math.cos(angle), 0] };
}

export function structureAt(
  voxels: Voxels,
  v: number,
  flat: boolean,
  cells: Int32Array = new Int32Array(OFFSETS.length),
): Structure {
  voxels.centroid(v, scratch);

  const count = around(voxels, scratch, cells);

  if (count < MIN_CELLS) return NO_STRUCTURE;

  const { mean, m } = covariance(voxels, cells, count);
  const horizontal = flat ? horizontalStructure(mean, m) : null;

  if (horizontal) return horizontal;

  const { values, vectors } = symmetricEigen(m);
  const line = values[1] < THIN * values[2];

  if (line ? !flat : values[0] > THIN * values[1] || values[1] < SPREAD * values[2]) return NO_STRUCTURE;

  const rows = line ? [vectors[0], vectors[1]] : [vectors[0]];

  return { anchor: mean, normals: rows.flatMap((n) => [n.x, n.y, n.z]) };
}

function nearest(pass: Pass, q: ArrayLike<number>): number {
  const { voxels, cells } = pass;
  const reach = pass.system.reach;
  let best = -1;
  let bestD = reach * reach;

  const count = around(voxels, q, cells);

  for (let i = 0; i < count; i++) {
    const v = cells[i];

    voxels.centroid(v, scratch);

    const d = (scratch[0] - q[0]) ** 2 + (scratch[1] - q[1]) ** 2 + (scratch[2] - q[2]) ** 2;

    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }

  return best;
}

interface System {
  h: Float64Array;
  g: Float64Array;
  rows: number;
  point: Float64Array;
  reach: number;
  jacobian: number[];
}

interface Pass {
  voxels: Voxels;
  local: Float32Array;
  step: number;
  known: Map<number, Structure>;
  flat: boolean;
  cells: Int32Array;
  system: System;
}

function addRow(system: System, q: ArrayLike<number>, s: Structure, k: number) {
  const nx = s.normals[k];
  const ny = s.normals[k + 1];
  const nz = s.normals[k + 2];
  const r = nx * (q[0] - s.anchor[0]) + ny * (q[1] - s.anchor[1]) + nz * (q[2] - s.anchor[2]);

  const withinReach = Math.abs(r) <= system.reach;

  if (!withinReach) return;

  const j = system.jacobian;

  j[0] = q[1] * nz - q[2] * ny;
  j[1] = q[2] * nx - q[0] * nz;
  j[2] = q[0] * ny - q[1] * nx;
  j[3] = nx;
  j[4] = ny;
  j[5] = nz;

  for (let a = 0; a < 6; a++) {
    system.g[a] += j[a] * r;

    for (let b = 0; b < 6; b++) system.h[a * 6 + b] += j[a] * j[b];
  }

  system.rows++;
}

function addPoint(pass: Pass, system: System, q: Float64Array) {
  const v = nearest(pass, q);

  if (v < 0) return;

  let s = pass.known.get(v);

  if (!s) {
    s = structureAt(pass.voxels, v, pass.flat, pass.cells);
    pass.known.set(v, s);
  }

  for (let k = 0; k < s.normals.length; k += 3) addRow(system, q, s, k);
}

function linearize(pass: Pass, pose: THREE.Matrix4): System {
  const e = pose.elements;
  const system = pass.system;
  const q = system.point;

  system.h.fill(0);
  system.g.fill(0);
  system.rows = 0;

  const { local, step } = pass;

  for (let i = 0; i < local.length; i += step * 3) {
    const x = local[i];
    const y = local[i + 1];
    const z = local[i + 2];

    q[0] = e[0] * x + e[4] * y + e[8] * z + e[12];
    q[1] = e[1] * x + e[5] * y + e[9] * z + e[13];
    q[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    addPoint(pass, system, q);
  }

  return system;
}

function isFlat(local: Float32Array): boolean {
  for (let i = 5; i < local.length; i += 3) if (local[i] !== local[2]) return false;

  return true;
}

export function matchSweep(voxels: Voxels, local: Float32Array, guess: THREE.Matrix4): THREE.Matrix4 {
  const flat = isFlat(local);
  const count = local.length / 3;
  const pass: Pass = {
    flat,
    voxels,
    local,
    step: Math.max(1, flat ? Math.ceil(count / FLAT_MATCH_POINTS) : Math.floor(count / MATCH_POINTS)),
    known: new Map(),
    cells: new Int32Array(OFFSETS.length),
    system: {
      h: new Float64Array(36),
      g: new Float64Array(6),
      rows: 0,
      point: new Float64Array(3),
      reach: voxels.size * REACH_VOXELS,
      jacobian: [0, 0, 0, 0, 0, 0],
    },
  };
  let pose = guess.clone();
  const inverse = guess.clone().invert();

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const { h, g, rows } = linearize(pass, pose);

    if (rows < MIN_ROWS) break;

    const away = untwist(pose.clone().multiply(inverse));

    for (let a = 0; a < 6; a++) {
      h[a * 7] += PRIOR * rows;
      g[a] += PRIOR * rows * away[a];
    }

    const delta = solve6(
      h,
      g.map((v) => -v),
    );

    if (!delta) break;

    pose = twist(delta).multiply(pose);

    if (delta.reduce((sum, v) => sum + v * v, 0) < SETTLED * SETTLED) break;
  }

  const gap = poseGap(guess, pose);

  return gap.metres > MAX_JUMP_M || gap.radians > MAX_TURN_RAD ? guess.clone() : pose;
}
