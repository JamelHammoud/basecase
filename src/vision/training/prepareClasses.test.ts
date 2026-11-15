import { describe, expect, it } from 'vitest';
import { prepareVisionTraining } from './prepare';
import { preparationFixture, preparationSet } from './prepareFixtures';

describe('merged training class identity', () => {
  it('keeps model classes, IDs and landmark order stable when dataset members move', async () => {
    const first = preparationSet('first');
    const second = preparationSet('second');

    first.classes = [
      { id: 4, name: 'Zebra', keypoints: ['tail', 'head'] },
      { id: 9, name: 'Block', keypoints: ['side'] },
    ];
    second.classes = [
      { id: 4, name: 'Block', keypoints: ['grip'] },
      { id: 7, name: 'Apple', keypoints: ['stem'] },
    ];
    first.frames.forEach((frame) => {
      frame.annotations[0].keypoints = [{ name: 'tail', x: 0, y: 0, visible: true }];
    });
    second.frames.forEach((frame) => {
      frame.jpeg[2] += 10;
      frame.annotations[0].keypoints = [{ name: 'grip', x: 0, y: 0, visible: true }];
    });

    const forward = await preparationFixture([first, second]);
    const reversed = await preparationFixture([second, first]);
    const one = await prepareVisionTraining(forward.dataset, 'keypoints', { ports: forward.ports });
    const two = await prepareVisionTraining(reversed.dataset, 'keypoints', { ports: reversed.ports });

    expect(one.classes).toEqual([
      { id: 0, name: 'Apple', keypoints: ['stem'] },
      { id: 1, name: 'Block', keypoints: ['grip', 'side'] },
      { id: 2, name: 'Zebra', keypoints: ['head', 'tail'] },
    ]);
    expect(two.classes).toEqual(one.classes);

    for (const result of [one, two]) {
      expect(result.trainingSets.find((set) => set.id === 'first')!.frames[0].annotations[0].classId).toBe(2);
      expect(result.trainingSets.find((set) => set.id === 'second')!.frames[0].annotations[0].classId).toBe(1);
      expect(result.sets.find((set) => set.id === 'first')!.frames[0].annotations[0].classId).toBe(4);
    }
  });
});
