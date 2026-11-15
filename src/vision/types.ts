export interface VisionSource {
  scene: string;
  kind: 'simulated' | 'recorded' | 'operator';
  id: string;
}

export interface VisionPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface VisionDetection {
  label: string;
  score: number;
  box: [number, number, number, number];
  keypoints?: [number, number][];
  mask?: { values: Uint8Array; width: number; height: number };
}

export interface VisionResult {
  backend?: 'webgpu' | 'wasm';
  modelId: string;
  source?: VisionSource;
  camera?: string;
  timestamp: number;
  width: number;
  height: number;
  detections: VisionDetection[];
  depth?: { values?: Float32Array; width: number; height: number; relative: true; nearness?: number };
  classes?: { label: string; score: number }[];
}

export interface VisionFrameOptions {
  source?: VisionSource;
  camera?: string;
  timestamp?: number;
}

export interface VisionTensor {
  data: ArrayLike<number | bigint>;
  dims: readonly number[];
}

export type VisionOutputs = Record<string, VisionTensor>;
