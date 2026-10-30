import { describe, expect, it } from 'vitest';
import { premiumPick, premiumText } from './premiumPick';

describe('premiumPick', () => {
  it('names a cheaper actuator with at least the same stall torque', () => {
    const pick = premiumPick('dynamixel-xm430-w350')!;

    expect(pick.cheaper.key).toBe('component:feetech-sts3250');
    expect(premiumText(pick)).toBe(
      'Premium pick: DYNAMIXEL XM430-W350-T at $310.39 costs over 2× Feetech STS3250 ($73.99, component:feetech-sts3250), which has at least its stall torque (4.90 vs 4.10 N·m).',
    );
  });

  it('leaves the cheapest part for its torque alone', () => {
    expect(premiumPick('feetech-sts3250')).toBeUndefined();
    expect(premiumPick('feetech-sts3215', 'c018')).toBeUndefined();
    expect(premiumPick('raspberry-pi-5')).toBeUndefined();
  });
});
