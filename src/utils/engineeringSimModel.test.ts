import { describe, expect, it } from 'vitest';
import { engineeringFindings } from '../readiness/findings';
import { biped, run, row, type Scene } from './engineering.fixtures';

const STS3215 = 'feetech-sts3215';

const unassigned = (s: Scene, ids: string[]): Scene => ({
  ...s,
  joints: s.joints.map((j) => (ids.includes(j.id) ? { ...j, actuators: [] } : j)),
});

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
      { text: 'No servo on Knee l, Knee r', ids: ['shankL', 'shankR'], status: 'warn' },
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
    ).not.toMatch(/Knee L|No torque data/);
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

describe('Servo models', () => {
  it('passes when every servo has a measured model', () => {
    expect(row(run(withServo(biped(), STS3215)), 'Servo models')).toMatchObject({
      status: 'pass',
      detail: 'Every servo has a measured model',
    });
  });

  it('names the servos without a measured model and selects them', () => {
    const r = run(unassigned(biped(), ['hipL', 'hipR', 'ankleL', 'ankleR']));
    const models = row(r, 'Servo models')!;

    expect(models.status).toBe('warn');
    expect(models.detail).toBe('2 joints without a measured model');
    expect(models.items).toEqual([
      { text: 'servo-kneeL, servo-kneeR on Knee l, Knee r', ids: ['servo-kneeL', 'servo-kneeR'], status: 'warn' },
    ]);
  });

  it('becomes one note in Checks, worded for a person', () => {
    const notes = engineeringFindings(run(biped())).filter((f) => f.check === 'Servo models');

    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      level: 'note',
      text: 'These servos have no measured model, so the simulation guesses how they respond.',
    });
    expect(notes[0].ids).toHaveLength(6);
  });
});
