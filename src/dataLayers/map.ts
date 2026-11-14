import * as THREE from 'three';
import { matchSweep } from './mapMatch';
import type { MapCloud } from './messages';
import { MAX_POINTS } from './pointSink';
import { MAP_VOXEL_M, pointBounds, Voxels, type MapBounds } from './voxels';

export const MAP_CAP = MAX_POINTS;

export interface MapOptions {
  voxelM?: number;
  cap?: number;
  match?: boolean;
  trackChanges?: boolean;
}

export interface Sweep {
  points: Float32Array;
  pose: THREE.Matrix4;
}

export interface MapSummary {
  frame: string | null;
  points: number;
  bounds: MapBounds | null;
}

export class ScanMap {
  readonly voxels: Voxels;

  readonly match: boolean;

  sweeps = 0;

  private correction = new THREE.Matrix4();

  constructor(options: MapOptions = {}) {
    this.voxels = new Voxels(options.voxelM ?? MAP_VOXEL_M, options.cap ?? MAP_CAP, options.trackChanges);
    this.match = options.match ?? true;
  }

  get count(): number {
    return this.voxels.count;
  }

  add({ points, pose }: Sweep): THREE.Matrix4 {
    const guess = this.correction.clone().multiply(pose);
    const placed = this.match && this.voxels.count > 0 ? matchSweep(this.voxels, points, guess) : guess;
    const e = placed.elements;

    this.correction = placed.clone().multiply(pose.clone().invert());
    this.sweeps++;

    for (let i = 0; i < points.length; i += 3) {
      const x = points[i];
      const y = points[i + 1];
      const z = points[i + 2];

      this.voxels.add(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14],
      );
    }

    return placed;
  }

  points(): Float32Array {
    return this.voxels.points();
  }
}

export function mapCloud(points: Float32Array, frame: string | null): MapCloud {
  const bounds = pointBounds(points);

  return { frame, points, bounds, low: bounds?.min[2] ?? 0, high: bounds?.max[2] ?? 0 };
}

export const mapSummary = (cloud: MapCloud): MapSummary => ({
  frame: cloud.frame,
  points: cloud.points.length / 3,
  bounds: cloud.bounds === undefined ? pointBounds(cloud.points) : cloud.bounds,
});
