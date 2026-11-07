import { describe, expect, it } from 'vitest';
import { driveBiped, segmentResults, steeringProblems, STEERING_TIMELINE } from './steering';

describe('biped drive with steering', () => {
  it('walks forward, turns left, turns right on its Kit velocity skill, and never falls', async () => {
    const { samples, startHeight: height } = await driveBiped(STEERING_TIMELINE);
    const results = segmentResults(samples, STEERING_TIMELINE);

    console.log(JSON.stringify(results));
    expect(steeringProblems(samples, { wanted: STEERING_TIMELINE, startHeight: height })).toEqual([]);
  }, 300_000);
});
