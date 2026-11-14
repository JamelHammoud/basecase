import { describe, expect, it } from 'vitest';
import { BAM_XL330 } from '../data/servoFits';
import {
  activeCalibration,
  activeCalibrations,
  activeMount,
  EMPTY_HISTORY,
  recordCalibration,
  recordMount,
  rollBack,
} from './history';
import type { CalibrationVerdict, ServoCalibration } from './types';

const calibration = (verdict: CalibrationVerdict, gain = 1): ServoCalibration => ({
  verdict,
  family: 'xl330',
  version: 0,
  rung: verdict === 'measured' ? 'response' : 'preset',
  fit: { ...BAM_XL330, errorGain: BAM_XL330.errorGain * gain },
  volts: 5,
  scales: { gain },
  conditions: { volts: 5, temperatureC: 30 },
  evidence: { logs: 6, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
});

describe('calibration history', () => {
  it('numbers every version and activates only measured ones', () => {
    let h = recordCalibration(EMPTY_HISTORY, calibration('measured', 1.1));

    h = recordCalibration(h, calibration('cant-tell'));
    h = recordCalibration(h, calibration('measured', 1.3));

    expect(h.versions.map((c) => c.version)).toEqual([1, 2, 3]);
    expect(activeCalibration(h)?.version).toBe(3);
  });

  it('a failed update keeps the last good calibration', () => {
    const good = recordCalibration(EMPTY_HISTORY, calibration('measured', 1.2));
    const after = recordCalibration(good, calibration('consistent'));

    expect(activeCalibration(after)?.version).toBe(1);
  });

  it('rolls back to the previous measured version, then to the preset', () => {
    let h = recordCalibration(EMPTY_HISTORY, calibration('measured', 1.1));

    h = recordCalibration(h, calibration('cant-tell'));
    h = recordCalibration(h, calibration('measured', 1.3));
    h = rollBack(h);
    expect(activeCalibration(h)?.version).toBe(1);
    h = rollBack(h);
    expect(activeCalibration(h)).toBeNull();
    expect(h.versions).toHaveLength(3);
  });

  it('collects the active calibration per joint', () => {
    const h = recordCalibration(EMPTY_HISTORY, calibration('measured'));

    expect(Object.keys(activeCalibrations({ a: h, b: EMPTY_HISTORY }))).toEqual(['a']);
    expect(activeCalibrations(undefined)).toEqual({});
  });

  const servo = { componentId: 'feetech-sts3215', variant: 'c001' };
  const reversed = { zeroCounts: 2184, direction: -1 } as const;

  it('keeps a zero found by the camera as a version that later fits carry', () => {
    let h = recordMount(EMPTY_HISTORY, { servo, verdict: 'measured', mount: reversed, reason: '' });

    expect(activeMount(h)).toEqual(reversed);
    expect(activeCalibration(h)?.rung).toBe('preset');
    h = recordCalibration(h, calibration('measured', 1.2));
    expect(activeCalibration(h)).toMatchObject({ version: 2, rung: 'response', mount: reversed });
    h = rollBack(h);
    expect(activeMount(h)).toEqual(reversed);
    h = rollBack(h);
    expect(activeMount(h)).toBeNull();
  });

  it('puts a found zero on top of a measured fit without losing the fit', () => {
    let h = recordCalibration(EMPTY_HISTORY, calibration('measured', 1.3));

    h = recordMount(h, { servo, verdict: 'measured', mount: reversed, reason: '' });
    expect(activeCalibration(h)).toMatchObject({ version: 2, scales: { gain: 1.3 }, mount: reversed });
    h = recordMount(h, { servo, verdict: 'cant-tell', mount: { zeroCounts: 2048, direction: 1 }, reason: '' });
    expect(activeCalibration(h)?.version).toBe(2);
  });
});
