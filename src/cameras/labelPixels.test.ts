import { describe, expect, it } from 'vitest';
import { annotationsForRaster, decodeDepthPixels, decodeInstancePixels } from './labelPixels';

const raster = new Uint32Array([1, 1, 1, 0, 2, 1, 0, 1, 0, 2, 1, 1, 1, 2, 2]);

const instances = [
  { id: 1, partId: 'handle', classId: 0, keypoints: {} },
  { id: 2, partId: 'person', classId: 1, keypoints: {} },
];

function unroll(counts: number[]): number[] {
  return counts.flatMap((count, i) => Array<number>(count).fill(i % 2));
}

describe('visible training labels', () => {
  it('derives tight visible boxes and exact column-major masks including a handle hole', () => {
    const labels = annotationsForRaster({ raster, width: 5, height: 3, instances, keypoints: {} });

    expect(labels.map((label) => label.bbox)).toEqual([
      [0, 0, 3, 3],
      [3, 0, 2, 3],
    ]);
    expect(unroll(labels[0].mask.counts)).toEqual([1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]);
    expect(labels[0].polygons).toHaveLength(2);
    expect(labels[0].polygons.every((polygon) => polygon.length >= 8)).toBe(true);
  });

  it('omits fully occluded instances and retains isolated thin tips', () => {
    const labels = annotationsForRaster({
      raster: new Uint32Array([0, 3, 0, 0, 0, 3]),
      width: 3,
      height: 2,
      instances: [...instances, { id: 3, partId: 'toe', classId: 2, keypoints: {} }],
      keypoints: {},
    });

    expect(labels).toHaveLength(1);
    expect(labels[0].bbox).toEqual([1, 0, 2, 2]);
    expect(labels[0].polygons).toHaveLength(2);
    expect(unroll(labels[0].mask.counts).filter(Boolean)).toHaveLength(2);
  });

  it('decodes raw GPU channels without sRGB transforms and flips the framebuffer rows', () => {
    const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);

    expect([...decodeInstancePixels(pixels, 1, 2)]).toEqual([0x060504, 0x030201]);
    expect([...decodeDepthPixels(new Uint8Array([100, 0, 0, 255, 0, 0, 0, 255]), 1, 2)]).toEqual([0, 1]);
  });
});
