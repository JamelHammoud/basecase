import { describe, expect, it } from 'vitest';
import { afterFailure, afterProbePassed, freshMembers, probeMembers } from './train.mjs';

describe('bisecting a failed batch', () => {
  it('suspects every member of a failed batch, and names a lone member the culprit', () => {
    expect(afterFailure([4, 5, 6, 7])).toEqual({ culprit: null, suspects: [4, 5, 6, 7] });
    expect(afterFailure([9])).toEqual({ culprit: 9, suspects: [] });
  });

  it('probes the first half of the suspects still ready', () => {
    expect(probeMembers([4, 5, 6, 7], [4, 5, 6, 7, 10])).toEqual([4, 5]);
    expect(probeMembers([4, 5, 6], [4, 6])).toEqual([4]);
  });

  it('moves to the other half when the probe passes, and names the last one standing', () => {
    expect(afterProbePassed([4, 5, 6, 7], [4, 5])).toEqual({ culprit: null, suspects: [6, 7] });
    expect(afterProbePassed([6, 7], [6])).toEqual({ culprit: 7, suspects: [] });
  });

  it('clears the suspects when every one of them passed, since the failure was elsewhere', () => {
    expect(afterProbePassed([6, 7], [6, 7])).toEqual({ culprit: null, suspects: [] });
  });
});

describe('the fresh batch', () => {
  it('keeps moving everything that is not under suspicion, up to fifteen', () => {
    const ready = Array.from({ length: 30 }, (_, i) => i + 1);

    expect(freshMembers(ready, [1, 2, 3])).toEqual(Array.from({ length: 15 }, (_, i) => i + 4));
  });
});
