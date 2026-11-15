import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT } from '../types/robotics';
import { recordBodyCalibration, rollBackBody } from '../reality/history';
import type { BodyCalibration } from '../reality/bodyTypes';
import { freshFalls, freshWalk, storedFalls, storedWalk } from './storedWalk';
import { projectFingerprint } from './runReadiness';
import { resolvePrinter } from '../data/printers';

const calibration: BodyCalibration = {
  version: 0,
  verdict: 'measured',
  robot: 'arm',
  fit: { massScales: { forearm: 1.3 }, payloadKg: { wrist: 0.15 }, floorFrictionScale: 1 },
  evidence: { presetErrorRad: 0.1, fittedErrorRad: 0.05, gain: 0.5 },
  modelFingerprint: 'preset',
};

describe('body calibration invalidates measured Checks', () => {
  it('reruns readiness and refuses cached peak and fall torques until rollback restores the old body', () => {
    const project = {
      ...DEFAULT_PROJECT,
      walk: storedWalk({ policy: 'p', seconds: 3, fellAt: null, joints: {} }, [], DEFAULT_PROJECT),
      falls: storedFalls({ directions: 4, tipped: 4, joints: {} }, [], DEFAULT_PROJECT),
    };
    const history = recordBodyCalibration({ versions: [], active: null }, calibration);
    const measured = { ...project, bodyCalibrations: { arm: history } };
    const rolled = { ...project, bodyCalibrations: { arm: rollBackBody(history) } };
    const printer = resolvePrinter('default', []);
    const world = { purchases: {}, money: { code: 'USD', ratesDate: '2026-11-14' } };
    const key = (settings: typeof project) => projectFingerprint([], settings, printer, world);

    expect(key(measured)).not.toBe(key(project));
    expect(freshWalk([], measured)).toBeUndefined();
    expect(freshFalls([], measured)).toBeUndefined();
    expect(key(rolled)).toBe(key(project));
    expect(freshWalk([], rolled)).toEqual(project.walk);
    expect(freshFalls([], rolled)).toEqual(project.falls);
  });
});
