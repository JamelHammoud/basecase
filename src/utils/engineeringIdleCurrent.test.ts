import { expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { component, joint, project } from './engineering.fixtures';
import { batteryRuntimeMinutes, powerRows } from './engineeringPower';
import type { CheckContext, WalkSim } from './engineeringTypes';
import { IDLE_A } from './servoAmps';

function idleFixture(count: number): CheckContext {
  const servos = Array.from({ length: count }, (_, i) =>
    component(`s${i}`, i % 2 ? 'dynamixel-xm430-w350' : 'feetech-sts3215', {
      componentVariant: i % 2 ? undefined : 'c001',
    }),
  );
  const joints = servos.map((servo, i) => joint(`j${i}`, { actuators: [servo.id, servo.id] }));
  const walk: WalkSim = {
    policy: 'Walk',
    seconds: 4,
    fellAt: null,
    joints: {},
    power: {
      avgA: 2,
      peakA: 4,
      joints: Object.fromEntries(joints.filter((_, i) => i % 3 === 0).map((j) => [j.id, { avgA: 2, peakA: 4 }])),
    },
  };
  const parts = [...servos, component('pack', 'ovonic-2s-2200-50c')];

  return {
    input: { parts, project: project(), measures: {}, servoOutputs: {}, walk },
    parts,
    servos,
    joints,
    project: project(),
    measures: {},
    byPart: new Map(parts.map((p) => [p.id, p])),
    byId: new Map(),
    all: { grams: 0, com: [0, 0, 0] },
    onFloor: [],
    bodies: [],
  };
}

it('adds idle draw only for servos absent from the walk and reads later joint edits', () => {
  for (const count of [1, 2, 12, 30]) {
    const ctx = idleFixture(count);
    const idle = ctx.servos.reduce(
      (sum, p, i) => sum + (i % 3 === 0 ? 0 : (actuatorOf(p.componentId!, p.componentVariant)?.idleA ?? IDLE_A)),
      0,
    );
    const average = 2 + idle + 2 / (7.4 * 0.9);
    const expected = ((0.8 * 2.2) / average) * 60;
    const before = structuredClone(ctx);

    expect(batteryRuntimeMinutes(ctx)).toBeCloseTo(expected, 12);
    expect(powerRows(ctx).find((row) => row.check === 'Current and runtime')?.detail).toContain('walking');
    expect(ctx).toEqual(before);

    ctx.joints[0].actuators = undefined;

    const addedIdle = actuatorOf(ctx.servos[0].componentId!, ctx.servos[0].componentVariant)?.idleA ?? IDLE_A;

    expect(batteryRuntimeMinutes(ctx)).toBeCloseTo(((0.8 * 2.2) / (average + addedIdle)) * 60, 12);
  }
});
