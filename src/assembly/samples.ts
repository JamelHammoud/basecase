import * as THREE from 'three';
import type { ShapeSolid } from '../three/analysis/shapeSolid';

const GRID_KEY_BASE = -1000;

function cellIndex(v: number, min: number, size: number, cells: number) {
  return Math.min(cells - 1, Math.max(0, Math.floor(((v - min) / Math.max(size, 1e-6)) * cells)));
}

const MAX_FACE_DIVISIONS = 12;

function facePoints(pos: Float32Array, cellMm: number): number[] {
  const out: number[] = [];
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  for (let t = 0; t + 8 < pos.length; t += 9) {
    a.fromArray(pos, t);
    b.fromArray(pos, t + 3);
    c.fromArray(pos, t + 6);

    const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    const n = Math.min(MAX_FACE_DIVISIONS, Math.ceil(longest / Math.max(cellMm, 1e-6)));

    for (let i = 1; n > 1 && i < n; i++) {
      for (let j = 1; i + j < n; j++) {
        const [u, v] = [i / n, j / n];

        out.push(
          a.x + (b.x - a.x) * u + (c.x - a.x) * v,
          a.y + (b.y - a.y) * u + (c.y - a.y) * v,
          a.z + (b.z - a.z) * u + (c.z - a.z) * v,
        );
      }
    }
  }

  return out;
}

function closestToCellCentres(pos: Float32Array, box: THREE.Box3, cells: number): Float32Array {
  const size = new THREE.Vector3().subVectors(box.max, box.min);
  const best = new Map<number, { d: number; i: number }>();

  for (let i = 0; i < pos.length; i += 3) {
    const c = [0, 1, 2].map((k) => cellIndex(pos[i + k], box.min.getComponent(k), size.getComponent(k), cells));
    const key3 = (c[0] * cells + c[1]) * cells + c[2];
    const d = [0, 1, 2].reduce((s, k) => {
      const centre = box.min.getComponent(k) + ((c[k] + 0.5) / cells) * size.getComponent(k);

      return s + (pos[i + k] - centre) ** 2;
    }, 0);
    const prev = best.get(key3);

    if (!prev || d < prev.d) best.set(key3, { d, i });
  }

  const out = new Float32Array(best.size * 3);
  let o = 0;

  for (const { i } of [...best.values()].sort((a, b) => a.i - b.i)) {
    out.set([pos[i], pos[i + 1], pos[i + 2]], o);
    o += 3;
  }

  return out;
}

export function gridSamples(solid: ShapeSolid, cells: number): Float32Array {
  const key = GRID_KEY_BASE - cells;
  const cached = solid.samples.get(key);

  if (cached) return cached;

  const size = solid.box.getSize(new THREE.Vector3());
  const faceStep = Math.max(Math.min(size.x, size.y, size.z), Math.max(size.x, size.y, size.z) / 8) / cells;
  const interior = facePoints(solid.positions, faceStep);
  const all = new Float32Array(solid.positions.length + interior.length);

  all.set(solid.positions);
  all.set(interior, solid.positions.length);

  const out = closestToCellCentres(all, solid.box, cells);

  solid.samples.set(key, out);

  return out;
}

export function worldPoints(samples: Float32Array, matrix: THREE.Matrix4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];

  for (let i = 0; i < samples.length; i += 3) out.push(new THREE.Vector3().fromArray(samples, i).applyMatrix4(matrix));

  return out;
}
