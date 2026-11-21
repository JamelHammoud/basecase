import type { ScenePart } from '../types/robotics';
import type { V3 } from '../utils/kinematics';

export interface MountDimensions {
  height: number;
  depth: number;
  spacing: number;
}

export interface FingerDimensions extends MountDimensions {
  length: number;
  thickness: number;
  clearance: number;
  v: number;
}

export interface FingerReference {
  version: 1;
  role: 'finger' | 'screw' | 'washer' | 'nut';
  mount: string;
  joint: string;
  target: string;
  travel: [number, number];
  axis: V3;
  hole?: number;
}

export type FingerPart = ScenePart & { gripperFinger: FingerReference };
