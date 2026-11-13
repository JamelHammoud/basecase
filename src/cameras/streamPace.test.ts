import { describe, expect, it } from 'vitest';
import { afterDraw, dueIds, nextDue, startPace, streamFps, streamSize, type Pace } from './streamPace';

function run(paces: Map<string, Pace>, ms: number, lateness: (tick: number) => number) {
  const drawn = new Map<string, number[]>([...paces.keys()].map((id) => [id, []]));
  let tick = 0;
  let now = 0;

  while (paces.size) {
    now = Math.max(now, nextDue(paces.values())) + lateness(tick++);

    if (now >= ms) break;

    for (const id of dueIds(paces, now)) {
      drawn.get(id)!.push(now);
      paces.set(id, afterDraw(paces.get(id)!, now));
    }
  }

  return drawn;
}

const perSecond = (times: number[], second: number) =>
  times.filter((t) => t >= second * 1000 && t < (second + 1) * 1000).length;

describe('stream pacing', () => {
  it('gives at most 15 frames a second at 15 fps, even when timers fire late', () => {
    const drawn = run(new Map([['a', startPace(15, 0)]]), 10_000, (tick) => (tick * 7) % 13);
    const times = drawn.get('a')!;

    for (let second = 0; second < 10; second++) expect(perSecond(times, second)).toBeLessThanOrEqual(15);

    expect(times.length).toBeGreaterThanOrEqual(140);
    expect(times.length).toBeLessThanOrEqual(150);
  });

  it('paces two streams at their own rates', () => {
    const paces = new Map([
      ['fast', startPace(15, 0)],
      ['slow', startPace(5, 0)],
    ]);
    const drawn = run(paces, 2000, () => 0);

    expect(drawn.get('fast')).toHaveLength(30);
    expect(drawn.get('slow')).toHaveLength(10);
  });

  it('gives a stopped stream nothing', () => {
    const paces = new Map([
      ['kept', startPace(10, 0)],
      ['stopped', startPace(10, 0)],
    ]);

    paces.delete('stopped');

    const drawn = run(paces, 1000, () => 0);

    expect(drawn.get('kept')).toHaveLength(10);
    expect(drawn.has('stopped')).toBe(false);
  });

  it('skips missed slots instead of bursting', () => {
    const late = afterDraw(startPace(10, 0), 350);

    expect(late.due).toBe(400);
    expect(dueIds([['a', late]], 360)).toEqual([]);
  });

  it('clamps size and rate', () => {
    expect(streamSize([2000, 0])).toEqual([640, 1]);
    expect(streamSize([319.6, 240])).toEqual([320, 240]);
    expect(streamFps(60)).toBe(15);
    expect(streamFps(Number.NaN)).toBe(1);
  });
});
