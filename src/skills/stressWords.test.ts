import { describe, expect, it } from 'vitest';
import { NOMINAL_PHYSICS, type PhysicsScales } from '../sim/physicsScales';
import type { RobotPoseState } from '../types/robotics';
import type { StressAxis, StressFinding, StressResult, StressSide } from './stress';
import { findingWords, stressReport } from './stressWords';

const start: RobotPoseState = { values: {} } as RobotPoseState;

const finding = (
  axis: StressAxis | 'combined',
  options: { side?: StressSide | null; boundary?: number | null; point?: Partial<PhysicsScales> },
): StressFinding => ({
  axis,
  side: options.side ?? null,
  boundary: options.boundary ?? null,
  point: { ...NOMINAL_PHYSICS, ...options.point },
  start,
  margin: -0.3,
});

describe('a stress finding in words', () => {
  it('says one condition as its boundary, with the side it fails on', () => {
    expect(findingWords(finding('friction', { side: 'below', boundary: 0.6184 }))).toBe('Friction < 0.62');
    expect(findingWords(finding('mass', { side: 'above', boundary: 1.3 }))).toBe('Weight > ×1.30');
    expect(findingWords(finding('strength', { side: 'below', boundary: 0.618 }))).toBe('Strength < 62%');
    expect(findingWords(finding('latencyMs', { side: 'above', boundary: 60.4 }))).toBe('Latency > 60 ms');
  });

  it('lists only the conditions a combination moved', () => {
    const combined = finding('combined', { point: { friction: 0.31, mass: 1.8, strength: 1.005 } });

    expect(findingWords(combined)).toBe('Friction 0.31, weight ×1.80');
  });
});

describe('the agent’s stress report', () => {
  const sample = (point: Partial<PhysicsScales>, margin: number) => ({
    point: { ...NOMINAL_PHYSICS, ...point },
    margin,
    start: 0,
  });
  const result: StressResult = {
    seed: 'abc123',
    budget: 160,
    rollouts: 158,
    nominal: sample({}, 0.42),
    axes: [
      { axis: 'friction', side: 'below', boundary: 0.62, worst: sample({ friction: 0.2 }, -0.5) },
      { axis: 'mass', side: null, boundary: null, worst: sample({}, 0.42) },
      { axis: 'strength', side: 'below', boundary: 0.55, worst: sample({ strength: 0.4 }, -0.2) },
      { axis: 'latencyMs', side: 'above', boundary: 90, worst: sample({ latencyMs: 150 }, -0.1) },
    ],
    worst: sample({ friction: 0.31, mass: 1.8 }, -0.64),
    starts: [start],
    findings: [],
    trace: [],
  };

  it('gives each condition’s boundary or the limits it held across, the worst combination, rollouts and seed', () => {
    expect(stressReport('Stand', result).split('\n')).toEqual([
      'Stressed Stand with 158 of 160 rollouts, seed abc123.',
      'Normal physics: margin +0.42, it passes there.',
      'Each condition alone:',
      '- Friction: fails below 0.62 (tested 0.20 to 1.50).',
      '- Weight: held from ×0.50 to ×2.00.',
      '- Strength: fails below 55% (tested 40% to 120%).',
      '- Latency: fails above 90 ms (tested 0 ms to 150 ms).',
      'Worst combination found: friction 0.31, weight ×1.80, strength 100%, latency 0 ms; margin −0.64, it fails there.',
      'A positive margin passes the skill’s contract and a negative one fails it. Friction, weight and strength are multiples of the robot’s own; latency is servo delay added on top.',
    ]);
  });
});
