import { splitOf, type DatasetSplit } from '../datasets/datasetSplit';
import { canonicalJson } from '../skills/hash';
import {
  depthBytes,
  frameSetFromManifest,
  manifestOf,
  readDepth,
  type FrameSetManifest,
  type VisionFrame,
  type VisionFrameSet,
} from './frameSet';

export type VisionFiles = Record<string, Uint8Array>;
export type VisionSplit = DatasetSplit & { test?: string[] };
export type SplitName = 'train' | 'val' | 'test';
export const SPLITS: SplitName[] = ['train', 'val', 'test'];
export const jsonBytes = (value: unknown) => new TextEncoder().encode(canonicalJson(value));
export const fileText = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export interface ExportFrame extends Omit<VisionFrame, 'image' | 'depth'> {
  split: SplitName;
}

export interface ExportSidecar {
  format: 'basecase-vision-export';
  version: 1;
  kind: 'coco' | 'yolo';
  manifest: FrameSetManifest;
  frames: ExportFrame[];
}

export function visionSplit(set: VisionFrameSet): VisionSplit {
  const split = splitOf(
    set.frames.map((f) => f.id),
    set.seed,
  );
  const held = splitOf(split.validation, set.seed);

  return { ...split, validation: held.train, test: held.validation };
}

export function frameSplit(id: string, split: VisionSplit): SplitName {
  if (split.validation.includes(id)) return 'val';

  if (split.test?.includes(id)) return 'test';

  if (split.train.includes(id)) return 'train';

  throw new Error('Frame is missing from the export split.');
}

export function exportBase(set: VisionFrameSet, kind: ExportSidecar['kind'], split: VisionSplit): VisionFiles {
  const files: VisionFiles = {};
  const frames = set.frames.map((frame): ExportFrame => {
    const { image, depth, ...metadata } = frame;
    const folder = frameSplit(frame.id, split);

    files[`images/${folder}/${frame.id}.jpg`] = image;
    files[`depth/${frame.id}.f32`] = depthBytes(depth);

    return { ...metadata, split: folder };
  });

  files['basecase.json'] = jsonBytes({
    format: 'basecase-vision-export',
    version: 1,
    kind,
    manifest: manifestOf(set),
    frames,
  });

  return files;
}

export function importBase(
  files: VisionFiles,
  kind: ExportSidecar['kind'],
): { sidecar: ExportSidecar; set: VisionFrameSet } | null {
  try {
    const sidecar: ExportSidecar = JSON.parse(fileText(files['basecase.json']));

    if (sidecar.format !== 'basecase-vision-export' || sidecar.version !== 1 || sidecar.kind !== kind) return null;

    const frames = sidecar.frames.map((metadata): VisionFrame => {
      const { split, ...frame } = metadata;

      return {
        ...frame,
        image: files[`images/${split}/${frame.id}.jpg`],
        depth: readDepth(files[`depth/${frame.id}.f32`]),
      };
    });
    const set = frameSetFromManifest(sidecar.manifest, frames);

    return set ? { sidecar, set } : null;
  } catch {
    return null;
  }
}

export function identicalFiles(actual: VisionFiles, expected: VisionFiles, paths: string[]): boolean {
  return paths.every((path) => actual[path] && fileText(actual[path]) === fileText(expected[path]));
}
