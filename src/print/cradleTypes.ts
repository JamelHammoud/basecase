import type { V3 } from '../guide/guideTypes';

export interface CradleSource {
  id: string;
  positions: Float32Array;
}

export interface CradleInput {
  sources: CradleSource[];
  down: V3;
  clearanceMm: number;
  baseMm: number;
  wallMm: number;
  depthMm: number;
}

export interface CradleGeometry {
  normals: Float32Array;
  positions: Float32Array;
  sourceIds: string[];
  toWorld: number[];
  supportAreaMm2: number;
  cavityAreaMm2: number;
  clearanceMm: number;
  baseMm: number;
  wallMm: number;
  depthMm: number;
}

export const CRADLE_LIMITS = {
  toleranceMm: 0.01,
  maxSources: 32,
  maxSourceNodes: 4096,
  maxSourceDepth: 12,
  maxTriangles: 20_000,
  maxOutputTriangles: 100_000,
  maxSpanMm: 400,
  maxCoordinateMm: 10_000,
  minSupportAreaMm2: 25,
  minSupportShare: 0.2,
  maxClearanceMm: 3,
  maxBaseMm: 20,
  maxWallMm: 20,
  maxDepthMm: 30,
} as const;

export type CradleFailure =
  | 'input'
  | 'limit'
  | 'mesh'
  | 'face'
  | 'undercut'
  | 'support'
  | 'wall'
  | 'move'
  | 'driver'
  | 'tool'
  | 'source'
  | 'plate';

export class CradleError extends Error {
  readonly code: CradleFailure;

  constructor(code: CradleFailure) {
    super(`cradle:${code}`);
    this.code = code;
  }
}

export interface CradleIdentity {
  restingDown: CradleInput['down'];
  toWorld: number[];
  sceneId: string;
  fingerprint: string;
  step: number;
  sourceIds: string[];
  dimensionsMm: [number, number, number];
  clearanceMm: number;
  baseMm: number;
  wallMm: number;
  depthMm: number;
}
