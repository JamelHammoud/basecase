import type { PrintMaterial } from '../types/robotics';
import type { V3 } from './material';
import type { ScrewLine } from './mesh';

export type { V3 } from './material';
export type { ScrewLine } from './mesh';

export interface StrengthJob {
  key: string;
  part: string;
  material: PrintMaterial;
  infillPct: number;
  down?: V3;
  load: { origin: V3; axis: V3; torqueNmm: number; screws: ScrewLine[] };
  holds: ScrewLine[];
}

export interface StressField {
  origin: V3;
  h: V3;
  n: V3;
  cells: Int32Array;
  ratio: Float32Array;
}

export interface StrengthReading {
  key: string;
  part: string;
  factor: number;
  down: V3;
  best: { down: V3; factor: number };
  worst: V3;
  cells: number;
  ms: number;
  field: StressField;
}

export const FACTOR_PASS = 2;
export const FACTOR_WARN = 1.3;
