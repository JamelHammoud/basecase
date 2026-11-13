import { describe, expect, it } from 'vitest';
import { controllerValue, fmtMargin, fmtSteps, trainingLine } from './format';
import type { RobotAnimation } from '../../types/robotics';

describe('simulate format', () => {
  it('abbreviates step counts', () => {
    expect([999, 1500, 2_500_000, 25_000_000].map(fmtSteps)).toEqual(['999', '2K', '2.5M', '25M']);
  });

  it('signs a contract margin', () => {
    expect([0.123, -0.5, 0].map(fmtMargin)).toEqual(['+0.12', '−0.50', '+0.00']);
  });

  it('ends a training line in its percentage, or an ellipsis when the message has no end of its own', () => {
    expect(trainingLine('Training on 64 robots', 0.45)).toBe('Training on 64 robots 45%');
    expect(trainingLine('Building environments', null)).toBe('Building environments…');
    expect(trainingLine('Training from a fall.', null)).toBe('Training from a fall.');
  });

  it('maps the running controller to its select value', () => {
    const animation = { id: 'walk' } as RobotAnimation;

    expect(controllerValue({ kind: 'hold' }, null)).toBe('hold');
    expect(controllerValue({ kind: 'animation', animation }, 'p1')).toBe('anim:walk');
    expect(controllerValue({ kind: 'policy', policy: {} as never, robot: 'r' }, 'p1')).toBe('policy:p1');
    expect(controllerValue({ kind: 'policy', policy: {} as never, robot: 'r' }, null)).toBe('');
  });
});
