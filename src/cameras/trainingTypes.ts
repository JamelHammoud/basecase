import type { V3 } from '../utils/kinematics';

export interface TrainingPoint {
  instance: string;
  name: string;
  position: V3;
}

export interface TrainingKeypoint {
  instance: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
}

export interface TrainingObjectVariation {
  position?: V3;
  rotation?: V3;
  visible?: boolean;
  mm?: number;
  deg?: number;
  colors?: Array<{ name: string; color: string }>;
}

export interface TrainingRandomization {
  lighting?: number;
  colors?: number;
  textures?: number;
  objects?: Record<string, TrainingObjectVariation>;
  cameraPositionMm?: number;
  cameraRotationDeg?: number;
  lensDeg?: number;
  noise?: number;
}

export interface CameraTrainingRequest {
  isolate?: string;
  labelsOnly?: boolean;
  requireGeometry?: boolean;
  poses: Float64Array | null;
  key: string;
  width: number;
  height: number;
  seed: number;
  keypoints: TrainingPoint[];
  randomization?: TrainingRandomization;
}

export interface CameraTrainingFrame {
  jpeg: Uint8Array;
  width: number;
  height: number;
  instanceIds: Uint32Array;
  depth: Float32Array;
  keypoints: TrainingKeypoint[];
  instances: Array<{ id: number; instance: string }>;
  variants: Record<string, string>;
}
