import { describe, expect, it } from 'vitest';
import { customModel, printerModel } from '../data/printers';
import { bedOf } from '../print/bed';
import { pickActuator, type ActuatorNeed } from './pickActuator';

const bed = bedOf(printerModel('bambu-lab-p1s')!);
const need = (loadNm: number, more: Partial<ActuatorNeed> = {}): ActuatorNeed => ({
  loadNm,
  kind: 'stance',
  bed,
  ...more,
});

const rank = (pick: ReturnType<typeof pickActuator>) =>
  'choice' in pick
    ? { ratio: pick.choice.ratio, amps: pick.choice.driver.peakA, stall: pick.choice.spec.stallNm }
    : null;

describe('pickActuator', () => {
  it('never picks a lower ratio, a smaller driver or a weaker actuator for a higher load', () => {
    const picks = Array.from({ length: 40 }, (_, i) => rank(pickActuator(need(0.5 + i * 0.5))));
    const offered = picks.filter((p) => p !== null);

    expect(offered.length).toBeGreaterThan(20);
    offered.slice(1).forEach((p, i) => {
      expect(p.ratio).toBeGreaterThanOrEqual(offered[i].ratio);
      expect(p.amps).toBeGreaterThanOrEqual(offered[i].amps);
      expect(p.stall).toBeGreaterThanOrEqual(offered[i].stall);
    });
    expect(new Set(offered.map((p) => p.ratio)).size).toBeGreaterThan(1);
  });

  it('picks for a peak walking load as well as for standing', () => {
    const calm = rank(pickActuator(need(1)))!;
    const landing = rank(pickActuator(need(1, { peakNm: 40 })))!;

    expect(landing.stall * 0.7).toBeGreaterThanOrEqual(40);
    expect(landing.stall).toBeGreaterThan(calm.stall);
  });

  it('never offers an actuator wider than the bed, and says why', () => {
    const small = bedOf(customModel({ width: 80, depth: 80, height: 80 }));
    const pick = pickActuator(need(1, { bed: small }));

    expect('choice' in pick).toBe(false);
    expect(pick).toEqual({ problem: 'The smallest actuator is 84.5 mm across, too wide for a 80 × 80 × 80 mm bed' });
  });

  it('says what the strongest actuator stalls at when none carries the load', () => {
    expect(pickActuator(need(200))).toEqual({
      problem: 'No actuator carries 200.00 N·m: the strongest stalls at 89.32 N·m',
    });
  });

  it('gives the same actuator for the same inputs', () => {
    expect(pickActuator(need(3.3, { rmsNm: 2 }))).toEqual(pickActuator(need(3.3, { rmsNm: 2 })));
  });
});
