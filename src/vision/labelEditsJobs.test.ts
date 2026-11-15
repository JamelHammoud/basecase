import { describe, expect, it } from 'vitest';
import { decodeMask, encodeMask } from './imageMasks';
import { labelEditsJobs } from './labelEditsJobs';

describe('segmentation label geometry worker jobs', () => {
  it('merges edits after worker cloning without treating unchanged labels as new edits', () => {
    const annotation = labelEditsJobs.geometry({
      width: 6,
      height: 6,
      instance: 'cup',
      classId: 0,
      box: [1, 1, 3, 3],
    }).result;
    const previous = { classes: [{ id: 0, name: 'Cup' }], frames: [{ id: 'frame', annotations: [annotation] }] };
    const next = { ...previous, classes: [{ id: 0, name: 'Mug' }] };
    const stored = structuredClone(previous);

    stored.frames[0].annotations = [{ ...annotation, source: 'agent', review: 'suggested' }];

    const merged = labelEditsJobs.merge(structuredClone({ previous, next, stored })).result;

    expect(merged.classes[0].name).toBe('Mug');
    expect(merged.frames[0].annotations[0]).toMatchObject({ source: 'agent', review: 'suggested' });
    expect(merged.same).toBe(false);
  });

  it('keeps the exact model mask and finds a foreground prompt even when the center is empty', () => {
    const pixels = new Uint8Array(36).fill(1);

    pixels[14] = 0;
    pixels[15] = 0;
    pixels[20] = 0;
    pixels[21] = 0;

    const mask = encodeMask(pixels, 6, 6);
    const { result: annotation } = labelEditsJobs.maskGeometry({
      width: 6,
      height: 6,
      mask,
      instance: 'ring',
      classId: 0,
    });
    const { result: point } = labelEditsJobs.maskPoint(mask);

    expect(decodeMask(annotation.mask)).toEqual(pixels);
    expect(pixels[point[1] * 6 + point[0]]).toBe(1);
    expect(annotation.box).toEqual([0, 0, 6, 6]);
  });

  it('refuses tracking a label with no visible mask pixels', () => {
    expect(() => labelEditsJobs.maskPoint(encodeMask(new Uint8Array(4), 2, 2))).toThrow('visible mask');
  });
});
