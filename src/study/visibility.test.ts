import { describe, expect, it } from 'vitest';
import { summarizeVisibility, visibilitySample } from './visibility';
import { visibilityPlan, validVisibilityRequest } from './visibilityPlan';
import type { CameraTrainingFrame } from '../cameras/trainingTypes';

const frame = (ids: number[], depths = ids.map(() => 100)): CameraTrainingFrame => ({
  jpeg: new Uint8Array(),
  width: 4,
  height: 1,
  instanceIds: Uint32Array.from(ids),
  depth: Float32Array.from(depths),
  instances: [
    { id: 1, instance: 'target' },
    { id: 2, instance: 'finger' },
  ],
  keypoints: [],
  variants: {},
});

describe('recorded camera visibility', () => {
  it('counts rendered target pixels with valid radial depth and distinguishes occlusion from leaving view', () => {
    expect(visibilitySample(frame([1, 2, 1, 0]), frame([1, 1, 1, 0]), 'target')).toEqual({ pixels: 2, potential: 3 });
    expect(visibilitySample(frame([2, 2, 2, 0]), frame([1, 1, 1, 0]), 'target')).toEqual({ pixels: 0, potential: 3 });
    expect(visibilitySample(frame([0, 0, 0, 0]), frame([0, 0, 0, 0]), 'target')).toEqual({ pixels: 0, potential: 0 });
    expect(() => visibilitySample(frame([1, 1, 0, 0], [0, NaN, 0, 0]), frame([1, 1, 0, 0]), 'target')).toThrow();
    expect(() => visibilitySample(frame([1, 1]), frame([1, 1]), 'target')).toThrow();
  });

  it('keeps camera-target results separate and unions complementary cameras at each timestamp without summing pixels', () => {
    const result = summarizeVisibility({
      key: 'recording-hash',
      width: 4,
      height: 1,
      times: [0, 1, 2],
      end: 3,
      targets: [{ id: 'target', minPixels: 2 }],
      cameras: ['front', 'rear'],
      captures: [
        [
          { target: { pixels: 2, potential: 3 } },
          { target: { pixels: 0, potential: 3 } },
          { target: { pixels: 0, potential: 0 } },
        ],
        [
          { target: { pixels: 1, potential: 3 } },
          { target: { pixels: 2, potential: 3 } },
          { target: { pixels: 2, potential: 3 } },
        ],
      ],
    });

    expect(result.coverage).toBe(1);
    expect(result.pairs.map((pair) => pair.seconds)).toEqual([1, 2]);
    expect(result.pairs[0].intervals).toEqual([
      { from: 1, to: 2, state: 'occluded' },
      { from: 2, to: 3, state: 'outside' },
    ]);
    expect(result.targets[0].seconds).toBe(3);
  });

  it('keeps missing captures unknown unless a simultaneous camera meets the threshold', () => {
    const result = summarizeVisibility({
      key: 'hash',
      width: 4,
      height: 1,
      times: [0, 1],
      end: 2,
      targets: [{ id: 'target', minPixels: 2 }],
      cameras: ['a', 'b'],
      captures: [
        [null, null],
        [{ target: { pixels: 2, potential: 2 } }, { target: { pixels: 0, potential: 0 } }],
      ],
    });

    expect(result.coverage).toBeUndefined();
    expect(result.targets[0]).toMatchObject({ seconds: 1, unavailableSeconds: 1 });
    expect(result.pairs[0].intervals).toEqual([{ from: 0, to: 2, state: 'unavailable' }]);
  });

  it('rejects empty targets, unsupported sizes, duplicate identities and unbounded sample requests', () => {
    const request = { tryId: 'recorded', cameras: ['eye'], targets: [{ id: 'target', minPixels: 20 }], samples: 8 };

    expect(validVisibilityRequest(request)).toBe(true);
    expect(validVisibilityRequest({ ...request, targets: [] })).toBe(false);
    expect(validVisibilityRequest({ ...request, samples: 33 })).toBe(false);
    expect(validVisibilityRequest({ ...request, cameras: ['eye', 'eye'] })).toBe(false);
    expect(validVisibilityRequest({ ...request, targets: [{ id: 'target', minPixels: 0 }] })).toBe(false);
    expect(
      visibilityPlan(request, { frames: 100, dt: 0.02, t: Float32Array.from({ length: 100 }, (_, i) => i * 0.02) }, 1)
        .indices,
    ).toHaveLength(8);
    expect(() =>
      visibilityPlan({ ...request, samples: 32 }, { frames: 100, dt: 0.02, t: new Float32Array(100) }, 64),
    ).toThrow();
  });
});
