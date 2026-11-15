import { describe, expect, it } from 'vitest';
import { selectTryFrames } from './tryFrameSelection';

const source = (frames: number, id = 'try') => ({ stored: { id, frames, rate: 10 }, recording: null });

describe('try frame selection', () => {
  it('selects the playhead and inclusive range without converting frame indexes to seconds first', () => {
    expect(selectTryFrames([source(30)], { kind: 'frame', frame: 12 })).toEqual([
      { tryIndex: 0, frame: 12, seconds: 1.2 },
    ]);
    expect(selectTryFrames([source(30)], { kind: 'range', from: 3, to: 10, step: 3 }).map((p) => p.frame)).toEqual([
      3, 6, 9,
    ]);
    expect(selectTryFrames([source(10)], { kind: 'every', step: 4 }).map((p) => p.frame)).toEqual([0, 4, 8]);
  });

  it('uses recording timestamps and distributes fifty images across ten tries', () => {
    const tries = Array.from({ length: 10 }, (_, i) => source(101, `try-${i}`));
    const selected = selectTryFrames(tries, { kind: 'sample', count: 50 });

    expect(selected).toHaveLength(50);
    expect(selected.filter((p) => p.tryIndex === 0).map((p) => p.frame)).toEqual([0, 25, 50, 75, 100]);
    expect(new Set(selected.map((p) => p.tryIndex)).size).toBe(10);
    expect(
      selectTryFrames([{ ...source(3), recording: { t: new Float32Array([0, 0.09, 0.21]), frames: 3 } }], {
        kind: 'frame',
        frame: 2,
      })[0].seconds,
    ).toBeCloseTo(0.21);
  });

  it('redistributes samples when a short try cannot fill its share', () => {
    const selected = selectTryFrames([source(2, 'short'), source(20, 'long')], { kind: 'sample', count: 8 });

    expect(selected.filter((p) => p.tryIndex === 0)).toHaveLength(2);
    expect(selected.filter((p) => p.tryIndex === 1)).toHaveLength(6);
    expect(new Set(selected.map((p) => `${p.tryIndex}:${p.frame}`)).size).toBe(8);
  });

  it.each([
    { kind: 'frame', frame: -1 },
    { kind: 'frame', frame: 10 },
    { kind: 'every', step: 0 },
    { kind: 'range', from: 5, to: 4 },
    { kind: 'range', from: 0, to: 10 },
    { kind: 'sample', count: 0 },
    { kind: 'sample', count: 1001 },
  ] as const)('refuses an out-of-range or malformed selection %j', (selection) => {
    expect(() => selectTryFrames([source(10)], selection)).toThrow();
  });
});
