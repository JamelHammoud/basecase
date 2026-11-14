import type { FrameSet, TrainingFrame } from './frameSet';

export type StoredFrame = Omit<TrainingFrame, 'jpeg' | 'depth'>;
export type FrameSetManifest = Omit<FrameSet, 'frames'> & { frames: StoredFrame[] };
export type FrameSetSummary = Omit<FrameSetManifest, 'frames'> & { frames: number };
export interface FrameBytes {
  jpeg: Uint8Array;
  depth: Uint8Array;
}
export interface FrameSetBackend {
  list: () => Promise<FrameSetSummary[]>;
  manifest: (id: string) => Promise<FrameSetManifest | null>;
  frame: (id: string, frameId: string) => Promise<FrameBytes | null>;
  jpeg: (id: string, frameId: string) => Promise<Uint8Array | null>;
  saveFrame: (id: string, frameId: string, bytes: FrameBytes) => Promise<void>;
  saveManifest: (manifest: FrameSetManifest, sourceId?: string) => Promise<void>;
}

export function checkedFrameId(id: string): string {
  if (typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id))
    throw new Error('Check the image id.');

  return id;
}

export const manifestOf = (set: FrameSet): FrameSetManifest => ({
  ...set,
  frames: set.frames.map(({ jpeg: _jpeg, depth: _depth, ...frame }) => frame),
});

export const summaryOf = (manifest: FrameSetManifest): FrameSetSummary => ({
  ...manifest,
  frames: manifest.frames.length,
});
