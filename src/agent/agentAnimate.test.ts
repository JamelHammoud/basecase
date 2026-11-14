import { describe, expect, it } from 'vitest';
import { checkedTimes, worstProblems } from './agentAnimate';

describe('animate problem report', () => {
  it('reports the deepest floor reading, not the first', () => {
    const problems = worstProblems([
      { time: 0.125, lines: ['2 mm below the floor'] },
      { time: 0.5, lines: ['80 mm below the floor'] },
      { time: 0.75, lines: ['10 mm below the floor'] },
    ]);

    expect([...problems.values()]).toEqual(['80 mm below the floor at 0.5 s']);
  });

  it('reports the deepest clash for each pair apart', () => {
    const problems = worstProblems([
      { time: 0, lines: ['arm passes 1.5 mm into hip', 'arm passes 3 mm into leg'] },
      { time: 1, lines: ['arm passes 40 mm into hip'] },
    ]);

    expect([...problems.values()]).toEqual(['arm passes 40 mm into hip at 1.0 s', 'arm passes 3 mm into leg at 0.0 s']);
  });

  it('ranks a reading in meters above one in mm', () => {
    const problems = worstProblems([
      { time: 0, lines: ['1.2 m below the floor'] },
      { time: 1, lines: ['845 mm below the floor'] },
    ]);

    expect([...problems.values()]).toEqual(['1.2 m below the floor at 0.0 s']);
  });

  it('keeps one line for clashes left off the list', () => {
    const problems = worstProblems([
      { time: 0, lines: ['…and 2 more clashes'] },
      { time: 1, lines: ['…and 5 more clashes'] },
    ]);

    expect([...problems.values()]).toEqual(['…and 5 more clashes at 1.0 s']);
  });

  it('checks the final pose of a motion that ends', () => {
    const times = checkedTimes({ duration: 2, loop: false });

    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(2);
    expect(times).toHaveLength(8);
  });

  it('skips the end of a loop, which is its start again', () => {
    const times = checkedTimes({ duration: 2, loop: true });

    expect(times.at(-1)).toBe(1.75);
    expect(times).toHaveLength(8);
  });
});
