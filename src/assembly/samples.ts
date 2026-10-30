import * as THREE from 'three';
import type { ShapeSolid } from '../three/analysis/shapeSolid';

const GRID_KEY_BASE = -1000;

function cellIndex(v: number, min: number, size: number, cells: number) {
  return Math.min(cells - 1, Math.max(0, Math.floor(((v - min) / Math.max(size, 1e-6)) * cells)));
}

export function gridSamples(solid: ShapeSolid, cells: number): Float32Array {
  const key = GRID_KEY_BASE - cells;
  const cached = solid.samples.get(key);

  if (cached) return cached;

  const { min, max } = solid.box;
  const size = new THREE.Vector3().subVectors(max, min);
  const pos = solid.positions;
  const best = new Map<number, { d: number; i: number }>();

  for (let i = 0; i < pos.length; i += 3) {
    const c = [0, 1, 2].map((k) => cellIndex(pos[i + k], min.getComponent(k), size.getComponent(k), cells));
    const key3 = (c[0] * cells + c[1]) * cells + c[2];
    const d = [0, 1, 2].reduce((s, k) => {
      const centre = min.getComponent(k) + ((c[k] + 0.5) / cells) * size.getComponent(k);

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

  solid.samples.set(key, out);

  return out;
}

export function worldPoints(samples: Float32Array, matrix: THREE.Matrix4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];

  for (let i = 0; i < samples.length; i += 3) out.push(new THREE.Vector3().fromArray(samples, i).applyMatrix4(matrix));

  return out;
}
