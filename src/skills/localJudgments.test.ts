import { describe, expect, it } from 'vitest';
import { localJudgments } from './localJudgments';

const salt = '12'.repeat(32);

describe('private local judgment sequences', () => {
  it('replays distinct judgments exactly without sharing another workflow’s draws', () => {
    const first = localJudgments(salt)!;
    const restored = localJudgments(salt)!;
    const other = localJudgments('34'.repeat(32))!;
    const draws = Array.from({ length: 8 }, () => first());

    expect(draws).toEqual(Array.from({ length: 8 }, () => restored()));
    expect(draws[0]).not.toEqual(draws[1]);
    expect(draws[0]).not.toEqual(other());
    expect(draws.every((draw) => draw.byteLength === 32)).toBe(true);
    expect(localJudgments()).toBeUndefined();
  });
});
