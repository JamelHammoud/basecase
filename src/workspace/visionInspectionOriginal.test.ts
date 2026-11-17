import { describe, expect, it } from 'vitest';
import { frameHash } from '../vision/frameSet';
import { metricSet } from '../vision/training/metricsFixtures';
import { readFrameLabelSet } from './visionInspectionOriginal';

describe('original image navigation', () => {
  it('opens matching current content and refuses changed labels, classes, images and missing content', async () => {
    const original = metricSet();
    const expected = { hash: await frameHash(original.frames[0]), classes: original.classes, current: () => true };
    const input = { id: original.id, frameId: original.frames[0].id, expected };

    expect(await readFrameLabelSet(input, async () => structuredClone(original))).toEqual(original);

    const changedClasses = structuredClone(original);
    const changedLabels = structuredClone(original);
    const changedImage = structuredClone(original);

    changedClasses.classes[0].name = 'Mug';
    changedLabels.frames[0].annotations = [];
    changedImage.frames[0].jpeg = new Uint8Array([255, 216, 1, 255, 217]);

    for (const set of [changedClasses, changedLabels, changedImage, null])
      await expect(readFrameLabelSet(input, async () => set)).rejects.toThrow('unavailable');

    expect(original.frames[0].annotations).toHaveLength(1);
  });

  it('ignores a load completed after cancellation or scene switching', async () => {
    const original = metricSet();
    let current = true;
    const input = {
      id: original.id,
      frameId: original.frames[0].id,
      expected: { hash: await frameHash(original.frames[0]), current: () => current },
    };

    expect(
      await readFrameLabelSet(input, async () => {
        current = false;

        return original;
      }),
    ).toBeUndefined();
    expect(
      await readFrameLabelSet(input, async () => {
        throw new Error('a cancelled load must stay idle');
      }),
    ).toBeUndefined();
  });
});
