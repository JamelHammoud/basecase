import { describe, expect, it } from 'vitest';
import { sizeActuators, type SizingJoint } from './actuatorSizing';
import { sizingText } from './actuatorSizingText';

const joint = (id: string, o: Partial<SizingJoint>): SizingJoint => ({
  id,
  name: id,
  holdNm: 0,
  massG: 300,
  servos: 1,
  currentG: 55,
  riders: [],
  ...o,
});

const biped = (kneeNm: number) => [
  joint('Hip pitch', { stanceNm: 0.5, holdNm: 0.85, massG: 430, riders: ['Knee', 'Ankle'] }),
  joint('Knee', { stanceNm: kneeNm, holdNm: 0.33, leverMm: 160, massG: 230, riders: ['Ankle'] }),
  joint('Ankle', { stanceNm: 0.49, holdNm: 0.03, massG: 100 }),
  joint('Shoulder', { holdNm: 0.31, massG: 320 }),
];

const pickOf = (families: ReturnType<typeof sizeActuators>, id: string) =>
  families[0].picks.find((p) => p.joint.id === id)!.pick?.option.key;

describe('sizeActuators', () => {
  it('puts the big servo only where the stance load needs it', () => {
    const families = sizeActuators({ joints: biped(1.85), totalG: 3460 });
    const best = families[0];

    expect(best).toMatchObject({ bus: 'feetech', failures: [] });
    expect(best.rail.volts).toBe(12);
    expect(pickOf(families, 'Knee')).toBe('component:feetech-sts3250');
    expect(pickOf(families, 'Hip pitch')).not.toBe('component:feetech-sts3250');
    expect(pickOf(families, 'Shoulder')).not.toBe('component:feetech-sts3250');
    expect(best.costUsd).toBeLessThan(families.find((f) => f.bus === 'dynamixel')!.costUsd);
  });

  it('carries the new servo weights into the loads they ride on', () => {
    const light = sizeActuators({ joints: biped(1.85), totalG: 3460 })[0];
    const knee = light.picks.find((p) => p.joint.id === 'Knee')!;

    expect(knee.loads.stanceNm!).toBeGreaterThan(1.85);
  });

  it('suggests lowering the load when nothing in reach passes', () => {
    const families = sizeActuators({ joints: biped(2.4), totalG: 3460 });
    const feetech = families.find((f) => f.bus === 'feetech' && f.rail.volts === 12)!;

    expect(feetech.failures.map((p) => p.joint.id)).toEqual(['Knee']);
    expect(families[0].failures).toEqual([]);
    expect(sizingText([feetech], 3460)).toMatch(
      /- Knee: needs 2\.\d\d N·m in stance; the strongest, Feetech STS3250, passes if that drops \d+%: shorten the leg segment under it by \d+ mm, or carry \d+ g less in the whole robot/,
    );
  });
});
