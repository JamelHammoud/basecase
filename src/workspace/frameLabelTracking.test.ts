import { describe, expect, it } from 'vitest';
import type { TrainingFrame } from '../vision/frameSet';
import { trackingFrames } from './frameLabelTracking';

const frame = (index: number, tryId = 'first', camera = 'front'): TrainingFrame => ({
  id: `${tryId}-${camera}-${index}`,
  seed: 0,
  camera,
  width: 2,
  height: 2,
  jpeg: new Uint8Array(),
  depth: new Float32Array(4),
  annotations: [],
  origin: { tryId, frame: index, seconds: index / 50 },
});

describe('frame label tracking', () => {
  it('starts at the chosen source frame and carries forward up to 30 frames from the same camera and try', () => {
    const frames = Array.from({ length: 40 }, (_, index) => frame(39 - index));
    const selected = trackingFrames([...frames, frame(5, 'other'), frame(5, 'first', 'wrist')], 'first-front-4');

    expect(selected.map((entry) => entry.origin?.frame)).toEqual(Array.from({ length: 31 }, (_, index) => index + 4));
    expect(selected.every((entry) => entry.camera === 'front' && entry.origin?.tryId === 'first')).toBe(true);
  });

  it('refuses an unrelated imported image without source-frame provenance', () => {
    const imported = { ...frame(0), origin: undefined };

    expect(() => trackingFrames([imported], imported.id)).toThrow('extracted from a try');
  });
});
