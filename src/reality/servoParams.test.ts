import { describe, expect, it } from 'vitest';
import { BAM_STS3215_7V4 } from '../data/servoFits';
import { fitDynamics } from '../sim/servoModel';
import { scaledFit } from './servoParams';

const VOLTS = 7.4;
const HOLDING = 0.2;
const before = fitDynamics(BAM_STS3215_7V4, VOLTS, HOLDING);
const after = (scales: Parameters<typeof scaledFit>[1]) =>
  fitDynamics(scaledFit(BAM_STS3215_7V4, scales), VOLTS, HOLDING);

describe('servo scales map onto one MuJoCo quantity each', () => {
  it('no scale is the preset', () => {
    expect(after({})).toEqual(before);
  });

  it('gain moves only kp', () => {
    const d = after({ gain: Math.log(1.5) });

    expect(d.kp).toBeCloseTo(before.kp * 1.5, 9);
    expect(d.damping).toBeCloseTo(before.damping, 9);
    expect(d.forceNm).toBeCloseTo(before.forceNm, 9);
  });

  it('force moves only the torque limit', () => {
    const d = after({ force: Math.log(0.8) });

    expect(d.forceNm).toBeCloseTo(before.forceNm * 0.8, 9);
    expect(d.kp).toBeCloseTo(before.kp, 9);
    expect(d.damping).toBeCloseTo(before.damping, 9);
  });

  it('damping, armature, friction and delay scale their own terms', () => {
    const d = after({
      damping: Math.log(2),
      armature: Math.log(0.5),
      friction: Math.log(3),
      loadFriction: 0,
      delay: Math.log(2),
    });
    const loadPart = BAM_STS3215_7V4.friction.loadExternal * HOLDING;

    expect(d.damping).toBeCloseTo(before.damping * 2, 9);
    expect(d.armature).toBeCloseTo(before.armature * 0.5, 9);
    expect(d.frictionloss).toBeCloseTo(BAM_STS3215_7V4.friction.base * 3 + loadPart, 9);
    expect(d.delayS).toBeCloseTo(before.delayS * 2, 9);
    expect(d.kp).toBeCloseTo(before.kp, 9);
  });
});
