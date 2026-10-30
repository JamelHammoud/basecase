import { describe, expect, it } from 'vitest';
import { actuatorOf } from '../data/components';
import { holdVerdict, ratingAt, stanceVerdict } from './actuatorRules';

const act = (id: string, variant?: string) => actuatorOf(id, variant)!;

describe('ratingAt', () => {
  it('reads stall and rated torque at the supply voltage from the datasheet points', () => {
    expect(ratingAt(act('feetech-sts3215', 'c001'), 6)).toMatchObject({ stallNm: 1.618, ratedNm: 0.392, volts: 6 });
    expect(ratingAt(act('feetech-sts3215', 'c001'), 6.7).stallNm).toBeCloseTo((1.618 + 1.912) / 2, 3);
    expect(ratingAt(act('dynamixel-xl430-w250'), 12)).toMatchObject({ stallNm: 1.5, ratedEstimated: true });
    expect(ratingAt(act('dynamixel-xl430-w250'), 12).ratedNm).toBeCloseTo(0.375, 3);
  });

  it('scales stall down below the lowest published voltage and never above the highest', () => {
    expect(ratingAt(act('feetech-sts3215', 'c018'), 11.1).stallNm).toBeCloseTo((2.942 * 11.1) / 12, 3);
    expect(ratingAt(act('feetech-sts3215', 'c018'), 14).stallNm).toBeCloseTo(2.942, 6);
    expect(ratingAt(act('dynamixel-xm430-w350'), 20)).toMatchObject({ stallNm: 4.8, volts: 14.8 });
  });
});

describe('verdicts', () => {
  const sts3250 = ratingAt(act('feetech-sts3250'), 12);

  it('passes a walker knee under 0.4 of stall and fails one over 0.6', () => {
    expect(stanceVerdict(1.86, sts3250)).toMatchObject({ status: 'pass' });
    expect(stanceVerdict(2.5, sts3250).status).toBe('warn');
    expect(stanceVerdict(1.86, ratingAt(act('feetech-sts3215', 'c018'), 12)).status).toBe('fail');
  });

  it('warns a holding joint above rated torque', () => {
    expect(holdVerdict(1.2, sts3250).status).toBe('pass');
    expect(holdVerdict(1.8, sts3250).status).toBe('warn');
    expect(holdVerdict(3.2, sts3250).status).toBe('fail');
  });
});
