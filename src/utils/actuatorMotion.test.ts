import { describe, expect, it } from 'vitest';
import { actuatorOptions, powerOptions } from './actuatorCatalog';
import { ratingAt } from './actuatorRules';
import { jointVerdict, sizeActuators, type SizingJoint } from './actuatorSizing';

const options = actuatorOptions().filter((o) => o.key.startsWith('component:feetech-sts3215|'));
const catalogPower = powerOptions();
const power = {
  batteries: catalogPower.batteries.filter((b) => Math.abs((b.battery?.nominalV ?? 0) - 11.1) < 0.01),
  regulators: catalogPower.regulators.filter((r) => r.regulator?.vout === 6),
};
const shoulder: SizingJoint = {
  id: 'shoulder',
  name: 'Shoulder',
  holdNm: 0.1,
  massG: 300,
  servos: 1,
  currentG: 55,
  riders: [],
};
const sized = (j: SizingJoint) =>
  sizeActuators({ joints: [j], totalG: 600, options, power }).find((f) => f.rail.volts === 6)!;

describe('motion actuator sizing', () => {
  it('picks a faster catalog servo when the same motion runs faster', () => {
    const slow = sized({ ...shoulder, peakSpeedDegS: 120 }).picks[0].pick!;
    const fast = sized({ ...shoulder, peakSpeedDegS: 300 }).picks[0].pick!;

    expect(slow.option.key).toBe('component:feetech-sts3215|c001');
    expect(fast.option.key).toBe('component:feetech-sts3215|c046');
    expect(ratingAt(fast.option.act, 6).rpm!).toBeGreaterThan(ratingAt(slow.option.act, 6).rpm!);
  });

  it('adds inertia times acceleration to the load before picking a servo', () => {
    const still = sized({ ...shoulder, holdNm: 0.25 });
    const moving = sized({
      ...shoulder,
      holdNm: 0.25,
      peakAccelerationDegS2: 1000,
      inertiaKgM2: 0.02,
    });
    const pick = moving.picks[0];

    expect(still.picks[0].pick!.option.key).toBe('component:feetech-sts3215|c001');
    expect(pick.pick!.option.key).toBe('component:feetech-sts3215|c044');
    expect(pick.loads.accelerationNm).toBeCloseTo((0.02 * 1000 * Math.PI) / 180);
    expect(pick.loads.motionNm).toBeCloseTo(0.25 + (0.02 * 1000 * Math.PI) / 180);
    expect(pick.pick!.stallShare).toBeGreaterThan(still.picks[0].pick!.stallShare);
  });

  it('checks torque at the requested speed and the supplied voltage', () => {
    const act = options.find((o) => o.key.endsWith('|c001'))!.act;
    const moving = { ...shoulder, peakSpeedDegS: 200 };

    expect(jointVerdict(moving, { holdNm: 0.45 }, act, 6).status).toBe('fail');
    expect(jointVerdict(moving, { holdNm: 0.45 }, act, 7.4).status).toBe('pass');
    expect(jointVerdict({ ...moving, servos: 2 }, { holdNm: 0.45 }, act, 6).status).toBe('pass');
  });

  it('keeps static candidates without rpm and refuses them for moving joints', () => {
    const { rpm, curve, ...act } = options[0].act;
    const moving = { ...shoulder, peakSpeedDegS: 30 };

    expect(rpm).toBeGreaterThan(0);
    expect(curve).toBeDefined();
    expect(jointVerdict(shoulder, { holdNm: 0.1 }, act).status).toBe('pass');
    expect(jointVerdict(moving, { holdNm: 0.1 }, act).status).toBe('fail');
  });

  it('refuses speed at or beyond no-load rpm even with no applied load', () => {
    const act = options.find((o) => o.key.endsWith('|c001'))!.act;

    expect(jointVerdict({ ...shoulder, peakSpeedDegS: 252 }, { holdNm: 0 }, act, 6).status).toBe('fail');
    expect(jointVerdict({ ...shoulder, peakSpeedDegS: 253 }, { holdNm: 0 }, act, 6).status).toBe('fail');
  });

  it('grades acceleration from the final joint mass model without precomputed loads', () => {
    const act = options.find((o) => o.key.endsWith('|c001'))!.act;
    const moving = { ...shoulder, holdNm: 0.25, peakAccelerationDegS2: 1000, inertiaKgM2: 0.02 };

    expect(jointVerdict(moving, moving, act, 6).status).not.toBe('pass');
  });

  it('adds replacement actuator inertia at its descendant path radius', () => {
    const bigServo = actuatorOptions().filter((o) => o.key === 'component:feetech-sts3250');
    const alpha = 100;
    const moving = {
      ...shoulder,
      peakAccelerationDegS2: alpha,
      inertiaKgM2: 0.02,
      riders: ['elbow'],
      riderRadiusMm: { elbow: 200 },
    };
    const family = sizeActuators({
      joints: [moving, { ...shoulder, id: 'elbow', holdNm: 0.4 }],
      totalG: 600,
      options: bigServo,
      power,
    })[0];
    const addedInertia = ((bigServo[0].grams! - 55) / 1000) * 0.2 ** 2;

    expect(family.failures).toEqual([]);
    expect(family.picks[0].loads.accelerationNm).toBeCloseTo(((0.02 + addedInertia) * alpha * Math.PI) / 180, 8);
  });
});
