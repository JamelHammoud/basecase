import type { SimConditions } from './conditions';
import type { FaultKind } from './faults';

export interface JointStat {
  id: string;
  peak: number;
  saturatedS: number;
  fault?: FaultKind;
}

export interface RobotStat {
  key: string;
  fellAt: number | null;
  height: number;
  tilt: number;
  travelled: number;
  forward: number;
  speed: number;
}

export interface SimStats {
  time: number;
  robots: RobotStat[];
  joints: JointStat[];
  rtf: number;
  conditions?: SimConditions | null;
  effector?: [number, number, number];
  effectors?: Array<[number, number, number]>;
}
