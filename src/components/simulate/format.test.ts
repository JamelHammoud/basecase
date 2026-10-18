import { describe, expect, it } from 'vitest';
import { controllerValue, fmtSteps, rewardPath } from './format';
import type { RobotAnimation } from '../../types/robotics';

describe('simulate format', () => {
  it('abbreviates step counts', () => {
    expect([999, 1500, 2_500_000, 25_000_000].map(fmtSteps)).toEqual(['999', '2K', '2.5M', '25M']);
  });

  it('maps the running controller to its select value', () => {
    const animation = { id: 'walk' } as RobotAnimation;

    expect(controllerValue({ kind: 'hold' }, null)).toBe('hold');
    expect(controllerValue({ kind: 'animation', animation }, 'p1')).toBe('anim:walk');
    expect(controllerValue({ kind: 'policy', policy: {} as never, robot: 'r' }, 'p1')).toBe('policy:p1');
    expect(controllerValue({ kind: 'policy', policy: {} as never, robot: 'r' }, null)).toBe('');
  });

  it('draws the reward curve in a 100 × 36 box', () => {
    expect(rewardPath([1])).toBe('');
    expect(rewardPath([0, 1, 0.5])).toBe('M0.00,34.00 L50.00,2.00 L100.00,18.00');
  });
});
