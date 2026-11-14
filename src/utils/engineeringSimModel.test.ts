import { describe, expect, it } from 'vitest';
import { presetServo } from '../reality/servoEstimate';
import { FAMILY_SERVOS } from '../reality/servoPart';
import { EMPTY_HISTORY, recordCalibration, rollBack, type CalibrationHistory } from '../reality/history';
import type { ServoCalibration } from '../reality/types';
import { engineeringFindings } from '../readiness/findings';
import { biped, box, component, joint, part, run, row, type Scene } from './engineering.fixtures';

const STS3215 = 'feetech-sts3215';

const unassigned = (s: Scene, ids: string[]): Scene => ({
  ...s,
  joints: s.joints.map((j) => (ids.includes(j.id) ? { ...j, actuators: [] } : j)),
});

const rover = (wheels: Array<[string, string, string?]>): Scene => {
  const scene: Scene = {
    parts: [part('chassis', { massG: 800 })],
    measures: { chassis: box([-80, 30, -80], [80, 70, 80]) },
    joints: [],
  };

  wheels.forEach(([side, componentId, componentVariant], i) => {
    const x = i ? 90 : -90;

    scene.parts.push(
      part(`wheel${side}`, { massG: 40 }),
      component(`motor${side}`, componentId, { componentVariant, massG: 30 }),
    );
    scene.measures[`wheel${side}`] = box([x - 10, 0, -30], [x + 10, 60, 30]);
    scene.measures[`motor${side}`] = box([x * 0.7 - 10, 40, -10], [x * 0.7 + 10, 60, 10]);
    scene.joints.push(
      joint(`wheel${side}`, {
        name: `Wheel ${side}`,
        origin: [x, 30, 0],
        parent: ['chassis'],
        child: [`wheel${side}`],
        actuators: [`motor${side}`],
      }),
    );
  });

  return scene;
};

const withServo = (s: Scene, componentId: string): Scene => ({
  ...s,
  parts: s.parts.map((p) => (p.kind === 'component' ? { ...p, componentId, componentVariant: 'c001' } : p)),
});

describe('Torque estimates', () => {
  it('passes when every joint has a servo', () => {
    expect(row(run(biped()), 'Torque estimates')).toMatchObject({ status: 'pass' });
  });

  it('names the joints with no servo and selects their parts (seeded fault)', () => {
    const r = run(unassigned(biped(), ['kneeL', 'kneeR']));
    const estimates = row(r, 'Torque estimates')!;

    expect(estimates.status).toBe('warn');
    expect(estimates.detail).toBe('2 joints without a servo');
    expect(estimates.items).toEqual([
      { text: 'No servo on Knee l and Knee r', ids: ['shankL', 'shankR'], status: 'warn' },
    ]);
  });

  it('counts a published limit as known', () => {
    const s = unassigned(biped(), ['kneeL']);

    s.joints = s.joints.map((j) => (j.id === 'kneeL' ? { ...j, effortNm: 4 } : j));

    expect(row(run(s), 'Torque estimates')!.status).toBe('pass');
  });

  it('becomes one note in Checks, worded for a person', () => {
    const r = run(unassigned(biped(), ['kneeL']));
    const notes = engineeringFindings(r).filter((f) => f.check === 'Torque estimates');

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      level: 'note',
      text: 'These joints have no servo, so the simulation guesses their torque from weight.',
      detail: 'No servo on Knee l',
      ids: ['shankL'],
    });
  });

  it('leaves the joints without a servo out of Servo torque', () => {
    const r = run(unassigned(biped(), ['kneeL']));

    expect(
      row(r, 'Servo torque')!
        .items!.map((i) => i.text)
        .join('\n'),
    ).not.toMatch(/Knee l|No torque data/);
  });

  it('reads Servo torque as not run when no joint has a servo', () => {
    const s = biped();
    const r = run(
      unassigned(
        s,
        s.joints.map((j) => j.id),
      ),
    );

    expect(row(r, 'Servo torque')!.status).toBe('not run');
    expect(row(r, 'Torque estimates')!.detail).toBe('6 joints without a servo');
    expect(row(r, 'Servo models')).toBeUndefined();
  });

  it('is left out without movable joints', () => {
    const r = run({ ...biped(), joints: [] });

    expect(row(r, 'Torque estimates')).toBeUndefined();
    expect(row(r, 'Servo models')).toBeUndefined();
  });
});

const LEGS = ['hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];

const measuredFit = (): ServoCalibration => ({
  ...presetServo(FAMILY_SERVOS.sts3215),
  verdict: 'measured',
  family: 'sts3215',
  version: 0,
  rung: 'response',
  scales: {},
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 2, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
});

const calibrated = (ids: string[]): Record<string, CalibrationHistory> =>
  Object.fromEntries(ids.map((id) => [id, recordCalibration(EMPTY_HISTORY, measuredFit())]));

const models = (servoCalibrations?: Record<string, CalibrationHistory>) =>
  row(run(withServo(biped(), STS3215), { servoCalibrations }), 'Servo models')!;

describe('Servo models over a calibration history', () => {
  it('warns while every joint runs on its catalog preset, and offers Calibrate on all of them', () => {
    const r = models();

    expect(r).toMatchObject({ status: 'warn', detail: '6 joints without a measured model' });
    expect(r.items![0].fix).toEqual({ kind: 'calibrate', joints: LEGS });
  });

  it('counts only the joints still estimated when some are measured', () => {
    const r = models(calibrated(['hipL', 'kneeL', 'ankleL', 'hipR']));

    expect(r.detail).toBe('2 joints without a measured model');
    expect(r.items).toEqual([
      {
        text: 'servo-kneeR and servo-ankleR on Knee r and Ankle r',
        ids: ['servo-kneeR', 'servo-ankleR'],
        status: 'warn',
        fix: { kind: 'calibrate', joints: ['kneeR', 'ankleR'] },
      },
    ]);
  });

  it('passes when every joint has a Measured calibration', () => {
    expect(models(calibrated(LEGS))).toMatchObject({ status: 'pass', detail: '' });
  });

  it('returns with the joint rolled back to its preset selected (seeded fault)', () => {
    const histories = calibrated(LEGS);
    const servoCalibrations = { ...histories, kneeR: rollBack(histories.kneeR) };
    const r = models(servoCalibrations);

    expect(r.detail).toBe('1 joint without a measured model');
    expect(r.items).toEqual([
      {
        text: 'servo-kneeR on Knee r',
        ids: ['servo-kneeR'],
        status: 'warn',
        fix: { kind: 'calibrate', joints: ['kneeR'] },
      },
    ]);
    expect(
      engineeringFindings(run(withServo(biped(), STS3215), { servoCalibrations })).find(
        (f) => f.check === 'Servo models',
      ),
    ).toMatchObject({
      agentText: 'Servo models: servo-kneeR on Knee r',
      fix: { kind: 'calibrate', joints: ['kneeR'] },
    });
  });
});

describe('Servo models', () => {
  it('leaves out wheels on measured servos and on gearmotors', () => {
    const r = run(
      rover([
        ['l', STS3215, 'c001'],
        ['r', 'pololu-micro-metal-gearmotor'],
      ]),
    );

    expect(row(r, 'Servo models')).toBeUndefined();
    expect(row(r, 'Torque estimates')!.status).toBe('pass');
  });

  it('names a few joints and counts the rest', () => {
    const models = row(run(biped()), 'Servo models')!;

    expect(models.detail).toBe('6 joints without a measured model');
    expect(models.items![0].text).toBe(
      'servo-hipL, servo-kneeL, servo-ankleL and 3 more on Hip l, Knee l, Ankle l and 3 more',
    );
    expect(models.items![0].ids).toHaveLength(6);
    expect(models.items![0].fix).toEqual({ kind: 'calibrate', joints: LEGS });
  });

  it('offers no Calibrate for servos the daemon can’t reach', () => {
    const models = row(run(withServo(biped(), 'dsservo-ds3218')), 'Servo models')!;

    expect(models.detail).toBe('6 joints without a measured model');
    expect(models.items![0].fix).toBeUndefined();
  });

  it('names the servos without a measured model and selects them', () => {
    const r = run(unassigned(biped(), ['hipL', 'hipR', 'ankleL', 'ankleR']));
    const models = row(r, 'Servo models')!;

    expect(models.status).toBe('warn');
    expect(models.detail).toBe('2 joints without a measured model');
    expect(models.items).toEqual([
      {
        text: 'servo-kneeL and servo-kneeR on Knee l and Knee r',
        ids: ['servo-kneeL', 'servo-kneeR'],
        status: 'warn',
        fix: { kind: 'calibrate', joints: ['kneeL', 'kneeR'] },
      },
    ]);
  });

  it('becomes one note in Checks, worded for a person', () => {
    const notes = engineeringFindings(run(biped())).filter((f) => f.check === 'Servo models');

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      level: 'note',
      text: 'These servos aren’t calibrated on this robot.',
    });
    expect(notes[0].ids).toHaveLength(6);
  });
});
