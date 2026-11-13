import { describe, expect, it } from 'vitest';
import { BAM_STS3215_7V4 } from '../data/servoFits';
import { EMPTY_HISTORY, recordCalibration } from '../reality/history';
import type { CalibrationVerdict, ServoCalibration } from '../reality/types';
import type { RobotJoint } from '../types/robotics';
import { jointRows } from './jointRows';
import type { JointStatus } from './robotState';
import { sceneRobot } from './sceneRobot';

const joint = (id: string, name: string, type: RobotJoint['type'] = 'revolute'): RobotJoint => ({
  id,
  name,
  type,
  parent: [],
  child: [],
  origin: [0, 0, 0],
  axis: [1, 0, 0],
});

const JOINTS = [
  joint('shoulder', 'Left shoulder'),
  joint('mount', 'Mount', 'fixed'),
  joint('elbow', 'Left elbow'),
  joint('wrist', 'Left wrist'),
];

const calibration = (verdict: CalibrationVerdict): ServoCalibration => ({
  verdict,
  family: 'sts3215',
  version: 0,
  rung: 'response',
  fit: BAM_STS3215_7V4,
  volts: 7.4,
  scales: {},
  conditions: { volts: 7.4, temperatureC: 30 },
  evidence: { logs: 2, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
});

const status = (id: number, position: number, reply = 'ok'): JointStatus => ({
  id,
  position: reply === 'ok' ? position : null,
  temp_c: reply === 'ok' ? 31 : null,
  volts: 7.4,
  torque_on: true,
  reply,
});

const connectedTo = (joints: RobotJoint[]) => {
  const robot = sceneRobot(joints);

  if (!robot.ok) throw new Error(robot.reason);

  return { ids: robot.spec.ids, jointIds: robot.joints };
};

const summary = (rows: ReturnType<typeof jointRows>) =>
  rows.map((r) => ({
    busId: r.busId,
    name: r.joint?.name ?? null,
    position: r.reading?.position ?? null,
    verdict: r.history?.versions.at(-1)?.verdict ?? null,
  }));

describe('jointRows', () => {
  it('joins every answered servo to its joint by the bus ID Connect gave it', () => {
    const rows = jointRows({
      joints: JOINTS,
      calibrations: { elbow: recordCalibration(EMPTY_HISTORY, calibration('measured')) },
      connection: { ...connectedTo(JOINTS), readings: [status(3, 2100), status(1, 2048), status(2, 1900)] },
    });

    expect(summary(rows)).toEqual([
      { busId: 1, name: 'Left shoulder', position: 2048, verdict: null },
      { busId: 2, name: 'Left elbow', position: 1900, verdict: 'measured' },
      { busId: 3, name: 'Left wrist', position: 2100, verdict: null },
    ]);
  });

  it('keeps a servo that missed its reply, with the reply it gave or none', () => {
    const rows = jointRows({
      joints: JOINTS,
      calibrations: undefined,
      connection: { ...connectedTo(JOINTS), readings: [status(1, 2048), status(2, 0, 'missing')] },
    });

    expect(rows.map((r) => [r.joint?.name, r.reading?.reply ?? null])).toEqual([
      ['Left shoulder', 'ok'],
      ['Left elbow', 'missing'],
      ['Left wrist', null],
    ]);
  });

  it('lists a calibrated scene before Connect, with IDs and verdicts and no readings', () => {
    const rows = jointRows({
      joints: JOINTS,
      calibrations: { wrist: recordCalibration(EMPTY_HISTORY, calibration('consistent')) },
      connection: null,
    });

    expect(summary(rows)).toEqual([
      { busId: 1, name: 'Left shoulder', position: null, verdict: null },
      { busId: 2, name: 'Left elbow', position: null, verdict: null },
      { busId: 3, name: 'Left wrist', position: null, verdict: 'consistent' },
    ]);
  });

  it('lists nothing before Connect when no joint has been calibrated', () => {
    expect(jointRows({ joints: JOINTS, calibrations: { elbow: EMPTY_HISTORY }, connection: null })).toEqual([]);
  });

  it('shows a servo by its ID alone when the connection came from another scene', () => {
    const rows = jointRows({
      joints: JOINTS,
      calibrations: { elbow: recordCalibration(EMPTY_HISTORY, calibration('measured')) },
      connection: { ids: [1, 2], jointIds: null, readings: [status(1, 2048)] },
    });

    expect(summary(rows)).toEqual([
      { busId: 1, name: null, position: 2048, verdict: null },
      { busId: 2, name: null, position: null, verdict: null },
    ]);
  });
});
