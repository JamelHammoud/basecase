import type { ScrewLine, StrengthJob, V3 } from './types';

export interface LightenBox {
  min: V3;
  max: V3;
}

export interface LightenPlane {
  point: V3;
  normal: V3;
  halfThickness: number;
}

export interface LightenFrozen {
  lines?: ScrewLine[];
  boxes?: LightenBox[];
  planes?: LightenPlane[];
}

export interface LightenInput {
  positions: Float32Array | number[];
  jobs: StrengthJob[];
  frozen?: LightenFrozen;
  targetShare: number;
  minWallMm: number;
}

export interface LightenResult {
  positions: Float32Array;
  originalVolumeMm3: number;
  volumeMm3: number;
  volumeShare: number;
  originalGrams: number;
  grams: number;
  massShare: number;
  iterations: number;
  compliance: number[];
  cellMm: number;
  ms: number;
}
