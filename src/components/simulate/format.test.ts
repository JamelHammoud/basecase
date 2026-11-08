import { describe, expect, it } from 'vitest';
import { controllerValue, fmtSteps } from './format';
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
});
