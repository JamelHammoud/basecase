import { describe, expect, it } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { readCases } from './schema';
import { touchTheDots } from './testing';

const robot = fixtureRobots().find((r) => r.id === 'arm-3dof')!;

describe('stored Case identity', () => {
  it('keeps an unchanged Case across renders and unrelated project edits', () => {
    const raw = touchTheDots(robot);
    const first = readCases([raw])[0];

    expect(readCases([raw])[0]).toBe(first);
    expect(readCases([touchTheDots(robot), raw])[1]).toBe(first);
    expect(first).toEqual(raw);
    expect(first).not.toBe(raw);
  });

  it('replaces a changed Case even when its id stays the same', () => {
    const raw = touchTheDots(robot);
    const first = readCases([raw])[0];
    const changed = { ...raw, task: { ...raw.task, seconds: raw.task.seconds + 1 } };
    const second = readCases([changed])[0];

    expect(second.id).toBe(first.id);
    expect(second).not.toBe(first);
    expect(second.task.seconds).toBe(raw.task.seconds + 1);
    expect(first.task.seconds).toBe(raw.task.seconds);
  });

  it('validates replacement records and drops malformed entries', () => {
    const raw = touchTheDots(robot);
    const first = readCases([raw])[0];

    expect(
      readCases([null, 2, [], { ...raw, id: '../case' }, { ...raw, task: { ...raw.task, seconds: NaN } }, raw]),
    ).toEqual([first]);
    expect(readCases(undefined)).toEqual([]);
  });
});
