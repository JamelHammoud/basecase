import { describe, expect, it } from 'vitest';
import { applyFrameConditions } from '../vision/conditions';
import { metricSet } from '../vision/training/metricsFixtures';

describe('image condition edits', () => {
  it('adds overlapping membership only to selected frames and keeps empty declarations after removal', () => {
    const original = metricSet();

    original.frames.push({ ...structuredClone(original.frames[0]), id: 'other' });

    const night = applyFrameConditions(original, { ids: ['one'], name: 'night', remove: false });
    const glare = applyFrameConditions(night, { ids: ['one', 'other'], name: 'glare', remove: false });
    const removed = applyFrameConditions(glare, { ids: ['one'], name: 'night', remove: true });

    expect(original.conditions).toBeUndefined();
    expect(glare.frames.map((frame) => frame.conditions)).toEqual([['night', 'glare'], ['glare']]);
    expect(removed.conditions).toEqual(['night', 'glare']);
    expect(removed.frames[0].conditions).toEqual(['glare']);
    expect(removed.frames[1]).toBe(glare.frames[1]);
    expect(removed.frames[0].split).toBe(original.frames[0].split);
  });

  it('refuses missing images and capacity overflow without changing any frame', () => {
    const set = metricSet();

    expect(() => applyFrameConditions(set, { ids: ['missing'], name: 'night', remove: false })).toThrow();
    set.conditions = Array.from({ length: 8 }, (_, index) => `c${index}`);
    set.frames[0].conditions = [...set.conditions];
    expect(() => applyFrameConditions(set, { ids: ['one'], name: 'night', remove: false })).toThrow();
    expect(set.frames[0].conditions).toHaveLength(8);
  });

  it('leaves identities and declarations unchanged when removing absent membership', () => {
    const set = metricSet();

    expect(applyFrameConditions(set, { ids: ['one'], name: 'night', remove: true })).toBe(set);
    expect(set).not.toHaveProperty('conditions');
    expect(set.frames[0]).not.toHaveProperty('conditions');
    set.conditions = Array.from({ length: 32 }, (_, index) => `condition-${index}`);
    expect(applyFrameConditions(set, { ids: ['one'], name: 'night', remove: true })).toBe(set);
    expect(set.conditions).toHaveLength(32);
  });
});
