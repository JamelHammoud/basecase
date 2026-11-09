import { describe, expect, it } from 'vitest';
import { BAM_XL330 } from '../data/servoFits';
import { activeCalibration, activeCalibrations, EMPTY_HISTORY, recordCalibration, rollBack } from './history';
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
});
