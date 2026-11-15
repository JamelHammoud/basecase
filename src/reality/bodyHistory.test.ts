import { describe, expect, it } from 'vitest';
import { activeBodyCalibration, recordBodyCalibration, rollBackBody } from './history';
import type { BodyCalibration, BodyHistory } from './bodyTypes';

const calibration = (verdict: BodyCalibration['verdict']): BodyCalibration => ({
  version: 0,
  verdict,
  robot: 'arm',
  fit: { massScales: { link: 1.5 }, payloadKg: { link: 0.2 }, floorFrictionScale: 0.6 },
  evidence: { presetErrorRad: 0.1, fittedErrorRad: 0.05, gain: 0.5 },
  modelFingerprint: 'preset',
});

describe('body calibration history', () => {
  it('activates measured versions and keeps inconclusive attempts in history', () => {
    const empty: BodyHistory = { versions: [], active: null };
    const first = recordBodyCalibration(empty, calibration('measured'));
    const unknown = recordBodyCalibration(first, calibration('cant-tell'));
    const latest = recordBodyCalibration(unknown, calibration('measured'));

    expect(empty.versions).toEqual([]);
    expect(unknown.active).toBe(1);
    expect(activeBodyCalibration(latest)?.version).toBe(3);
    expect(activeBodyCalibration(rollBackBody(latest))?.version).toBe(1);
    expect(activeBodyCalibration(rollBackBody(rollBackBody(latest)))).toBeNull();
    expect(rollBackBody(latest).versions).toHaveLength(3);
  });

  it('refuses an active pointer to an inconclusive attempt', () => {
    expect(activeBodyCalibration({ versions: [{ ...calibration('cant-tell'), version: 1 }], active: 1 })).toBeNull();
    expect(activeBodyCalibration(undefined)).toBeNull();
  });
});
