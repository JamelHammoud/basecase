import * as THREE from 'three';
import { poseMatrix } from './markers';
import type { OccupancyGrid } from './messages';

export interface GridDraw {
  width: number;
  height: number;
  texels: Uint8Array;
  placement: THREE.Matrix4;
}

const UNKNOWN_ALPHA = 0;
const FREE_ALPHA = 64;

export function cellColor(value: number, out: Uint8Array, at: number) {
  if (value < 0 || value > 100) {
    out.fill(0, at, at + 3);
    out[at + 3] = UNKNOWN_ALPHA;

    return;
  }

  const level = Math.round((255 * value) / 100);

  out[at] = level;
  out[at + 1] = level;
  out[at + 2] = level;
  out[at + 3] = FREE_ALPHA + Math.round(((255 - FREE_ALPHA) * value) / 100);
}

export function gridTexels(grid: OccupancyGrid, reuse?: Uint8Array): Uint8Array {
  const { width, height } = grid.info;
  const size = width * height * 4;
  const texels = reuse && reuse.length === size ? reuse : new Uint8Array(size);

  for (let i = 0; i < width * height; i++) cellColor(grid.data[i] ?? -1, texels, i * 4);

  return texels;
}

export function gridPlacement(grid: OccupancyGrid, frame: THREE.Matrix4): THREE.Matrix4 {
  const { width, height, resolution, origin } = grid.info;
  const span = new THREE.Matrix4().makeScale(width * resolution, height * resolution, 1);

  return frame.clone().multiply(poseMatrix(origin)).multiply(span);
}
