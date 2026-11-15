import { describe, expect, it, vi } from 'vitest';
import { benchLogOf } from '../../../reality/jointReplay';
import { unitHistories } from '../../../reality/projectCalibrations';
import { presetServo } from '../../../reality/servoEstimate';
import { FAMILY_SERVOS } from '../../../reality/servoPart';
import type { ServoCalibration, ServoLog } from '../../../reality/types';
import { DEFAULT_PROJECT, type ProjectSettings } from '../../../types/robotics';
import type { StudioContext } from '../types';
import calibrationStudio from './calibration';

vi.mock('../../../robot/robotStore', () => ({ selectedUnit: () => 'arm-a' }));

const servo = FAMILY_SERVOS.sts3215;
const calibration: ServoCalibration = {
  ...presetServo(servo),
  servo,
  verdict: 'measured',
  version: 0,
  rung: 'response',
  scales: {},
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 1, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
};
const logs: ServoLog[] = [
  {
    servo,
    dt: 0.1,
    goalRad: [0, 0.1],
    positionRad: [0, 0.07],
    loadRatio: [0, 0],
    volts: [7.4, 7.4],
    temperatureC: [30, 30],
    payload: { massKg: 0.06, armM: 0.03 },
  },
];

describe('calibration test hook', () => {
  it('records optional replay logs on the selected unit and keeps the two-argument call working', () => {
    let project: ProjectSettings = DEFAULT_PROJECT;
    const context = {
      core: {
        docs: {
          setProject: (change: (p: ProjectSettings) => ProjectSettings) => {
            project = change(project);
          },
        },
      },
    } as unknown as StudioContext;
    const hooks = calibrationStudio(() => context);

    hooks.calibrate('shoulder', calibration, logs);
    hooks.calibrate('elbow', calibration);

    const histories = unitHistories(project, 'arm-a');

    expect(histories.shoulder.active).toBe(1);
    expect(benchLogOf(histories.shoulder)).toMatchObject({ servo, logs });
    expect(histories.elbow.active).toBe(1);
    expect(benchLogOf(histories.elbow)).toBeNull();
    expect(unitHistories(project)).toEqual({});
    expect(calibration.logId).toBeUndefined();
  });
});
