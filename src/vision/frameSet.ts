import type { LensShot } from '../cameras/lensRender';
import { canonicalJson, sha256Hex } from '../skills/hash';
import { base64ToBytes, bytesToBase64 } from '../utils/base64';
import { validFrame, validFrameSet, validManifest } from './frameSetValidation';

export interface VisionClass {
  id: number;
  name: string;
  kind: string;
  keypoints?: string[];
}

export interface VisionKeypoint {
  x: number;
  y: number;
  visibility: 0 | 1 | 2;
}

export interface VisionMask {
  size: [number, number];
  counts: number[];
}

export interface VisionAnnotation {
  id: string;
  partId: string;
  classId: number;
  bbox: [number, number, number, number];
  mask: VisionMask;
  polygons: number[][];
  keypoints: Record<string, VisionKeypoint>;
}

export interface VisionCamera extends LensShot {
  key: string;
  label: string;
}

export interface VisionFrame {
  id: string;
  width: number;
  height: number;
  image: Uint8Array;
  depth: Float32Array;
  annotations: VisionAnnotation[];
  camera: VisionCamera;
  seed: number;
}

export interface VisionFrameSet {
  format: 'basecase-vision';
  version: 1;
  id: string;
  name: string;
  caseId: string;
  seed: number;
  classes: VisionClass[];
  frames: VisionFrame[];
}

export type FrameContent = Omit<VisionFrame, 'id'> & { id?: string };
export type FrameSetContent = Omit<VisionFrameSet, 'id'> & { id?: string };
export type StoredVisionFrame = Omit<VisionFrame, 'image' | 'depth'> & { image: string; depth: string };
export type FrameSetManifest = Omit<VisionFrameSet, 'frames'> & { frames: string[] };

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

export function depthBytes(depth: Float32Array): Uint8Array {
  if (LITTLE_ENDIAN) return new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);

  const words = new Uint32Array(depth.buffer, depth.byteOffset, depth.length);
  const bytes = new Uint8Array(depth.byteLength);
  const view = new DataView(bytes.buffer);

  words.forEach((word, index) => view.setUint32(index * 4, word, true));

  return bytes;
}

export function readDepth(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 4) throw new Error('Depth needs four bytes per pixel.');

  const depth = new Float32Array(bytes.byteLength / 4);
  const words = new Uint32Array(depth.buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  words.forEach((_, index) => (words[index] = view.getUint32(index * 4, true)));

  return depth;
}

export const storeFrame = (frame: VisionFrame): StoredVisionFrame => ({
  ...frame,
  image: bytesToBase64(frame.image),
  depth: bytesToBase64(depthBytes(frame.depth)),
});

export const restoreFrame = (frame: StoredVisionFrame): VisionFrame => ({
  ...frame,
  image: base64ToBytes(frame.image),
  depth: readDepth(base64ToBytes(frame.depth)),
});

const withoutId = (value: object) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id'));

export function hashFrame(frame: FrameContent): string {
  const content = withoutId(frame);

  return sha256Hex(
    canonicalJson({ ...content, image: bytesToBase64(frame.image), depth: bytesToBase64(depthBytes(frame.depth)) }),
  );
}

export function hashFrameSet(set: FrameSetContent): string {
  const content = withoutId(set);

  return sha256Hex(canonicalJson({ ...content, frames: set.frames.map(hashFrame) }));
}

export const frameSetManifest = (set: VisionFrameSet): FrameSetManifest => ({
  ...set,
  frames: set.frames.map((f) => f.id),
});
export const manifestOf = frameSetManifest;

export function hashFrameSetManifest(manifest: Omit<FrameSetManifest, 'id'> & { id?: string }): string {
  const content = withoutId(manifest);

  return sha256Hex(canonicalJson(content));
}

export function frameSetFromManifest(manifest: FrameSetManifest, frames: VisionFrame[]): VisionFrameSet | null {
  if (frames.length !== manifest.frames.length || frames.some((frame, i) => frame.id !== manifest.frames[i]))
    return null;

  const set = { ...manifest, frames };

  return validFrameSet(set) ? set : null;
}

export const serializeFrameSetManifest = (set: VisionFrameSet | FrameSetManifest): string =>
  canonicalJson({ ...set, frames: set.frames.map((f) => (typeof f === 'string' ? f : f.id)) });

export function readFrameSetManifest(text: string): FrameSetManifest | null {
  try {
    const value = JSON.parse(text);

    return validManifest(value) ? value : null;
  } catch {
    return null;
  }
}

export const serializeFrame = (frame: VisionFrame): string => canonicalJson(storeFrame(frame));

export function readFrame(text: string): VisionFrame | null {
  try {
    const frame = restoreFrame(JSON.parse(text));

    return validFrame(frame) ? frame : null;
  } catch {
    return null;
  }
}

export const serializeFrameSet = (set: VisionFrameSet): string =>
  canonicalJson({ ...set, frames: set.frames.map(storeFrame) });

export function readFrameSet(text: string): VisionFrameSet | null {
  try {
    const stored = JSON.parse(text);
    const set = { ...stored, frames: stored.frames.map(restoreFrame) };

    return validFrameSet(set) ? set : null;
  } catch {
    return null;
  }
}
