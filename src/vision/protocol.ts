import type { VisionKind, VisionModelManifest } from './manifest';

export interface VisionDetection {
  classId: number;
  label: string;
  score: number;
  box: [number, number, number, number];
  keypoints?: { x: number; y: number; score: number }[];
  mask?: { width: number; height: number; values: Uint8Array };
}

export interface VisionResult {
  modelId: string;
  kind: VisionKind;
  camera: string;
  timestamp: number;
  mediaTime?: number;
  mediaSource?: string;
  elapsedMs: number;
  width: number;
  height: number;
  detections?: VisionDetection[];
  classes?: { classId: number; label: string; score: number }[];
  depth?: { width: number; height: number; values: Float32Array; units?: 'meters' | 'relative'; centerMeters?: number };
}

export interface VisionFrame {
  camera: string;
  image: ImageBitmap;
  timestamp: number;
  mediaTime?: number;
  mediaSource?: string;
}

export type VisionBackend = 'webgpu' | 'wasm';
export type VisionRequest =
  | { id: number; type: 'load-pose' }
  | { id: number; type: 'load'; model: VisionModelManifest; bytes: ArrayBuffer }
  | ({ id: number; type: 'infer'; modelId: string; threshold?: number } & VisionFrame)
  | { id: number; type: 'dispose'; modelId?: string }
  | { type: 'disconnect'; source: string }
  | { type: 'configure'; cameras: Record<string, string[]> }
  | { type: 'port'; port: MessagePort; source?: string };

export type VisionReply =
  | { id: number; ok: true; result: VisionResult | { backend: VisionBackend } | null }
  | { id: number; ok: false; error: string }
  | { type: 'result'; result: VisionResult }
  | { type: 'error'; camera?: string; error: string };

export interface RgbaFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
