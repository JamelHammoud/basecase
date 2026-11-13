import { describe, expect, it } from 'vitest';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { presetServo } from './bench';
import { EMPTY_HISTORY, recordCalibration, rollBack, type CalibrationHistory } from './history';
import { measuredJoints } from './measuredJoints';
import type { CalibrationVerdict, ServoCalibration, ServoFamily } from './types';

const servo = (id: string, componentVariant = 'c001'): ScenePart =>
  ({ id, name: id, kind: 'component', componentId: 'feetech-sts3215', componentVariant }) as ScenePart;

const joint = (id: string): RobotJoint => ({
  id,
  name: id,
  type: 'revolute',
  parent: ['base'],
  child: [`${id}-link`],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
  actuators: [`${id}-servo`],
});

const calibration = (verdict: CalibrationVerdict, family: ServoFamily = 'sts3215'): ServoCalibration => ({
  ...presetServo('sts3215'),
  verdict,
  family,
  version: 0,
  rung: verdict === 'measured' ? 'response' : 'preset',
  scales: {},
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 2, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
});

const recorded = (...verdicts: CalibrationVerdict[]) =>
  verdicts.reduce<CalibrationHistory>((h, v) => recordCalibration(h, calibration(v)), EMPTY_HISTORY);

const JOINTS = ['shoulder', 'elbow', 'wrist'].map(joint);
const PARTS = JOINTS.map((j) => servo(`${j.id}-servo`));

const measured = (calibrations: Record<string, CalibrationHistory> | undefined, parts = PARTS) =>
  [...measuredJoints({ joints: JOINTS, parts, calibrations })].sort();

describe('measuredJoints', () => {
  it('is empty while every joint runs on its preset', () => {
    expect(measured(undefined)).toEqual([]);
    expect(measured({ shoulder: recorded('consistent'), elbow: recorded('cant-tell') })).toEqual([]);
  });

  it('names the joints whose active calibration is Measured', () => {
    expect(measured({ shoulder: recorded('measured'), elbow: recorded('consistent') })).toEqual(['shoulder']);
  });

  it('names every joint once all are measured, even after a later run can’t tell', () => {
    const all = {
      shoulder: recorded('measured'),
      elbow: recorded('measured', 'cant-tell'),
      wrist: recorded('measured'),
    };

    expect(measured(all)).toEqual(['elbow', 'shoulder', 'wrist']);
  });

  it('drops a joint rolled back to its preset, and keeps one rolled back to an earlier measurement', () => {
    const calibrations = {
      shoulder: rollBack(recorded('measured')),
      elbow: rollBack(recorded('measured', 'measured')),
      wrist: recorded('measured'),
    };

    expect(measured(calibrations)).toEqual(['elbow', 'wrist']);
  });

  it('leaves out a calibration for another servo, as the simulation does', () => {
    const parts = [servo('shoulder-servo', 'c018'), ...PARTS.slice(1)];
    const xl330 = recordCalibration(EMPTY_HISTORY, calibration('measured', 'xl330'));

    expect(measured({ shoulder: recorded('measured'), elbow: xl330 }, parts)).toEqual([]);
  });
});
