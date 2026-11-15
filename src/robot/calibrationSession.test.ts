import { beforeAll, describe, expect, it, vi } from 'vitest';
import { THREE_JOINT_ARM } from '../../e2e/armFixture';
import { keptBenchLogs } from '../reality/benchLogStore';
import { calibrator, type Calibrator } from '../reality/calibrateClient';
import { EMPTY_HISTORY, recordCalibration, type CalibrationHistory } from '../reality/history';
import { presetServo } from '../reality/servoEstimate';
import type { ServoCalibration, ServoPart } from '../reality/types';
import { playBench } from './benchRun';
import { calibrateRobot, calibrationPhase } from './calibrationSession';
import { jointRows } from './jointRows';
import { connectRobot, receiveRobotEvent, startRobotStore } from './robotStore';

vi.mock('./benchRun', async (original) => ({ ...(await original<typeof import('./benchRun')>()), playBench: vi.fn() }));
vi.mock('../reality/calibrateClient', () => ({ calibrator: vi.fn() }));

const C046: ServoPart = { componentId: 'feetech-sts3215', variant: 'c046' };
const XL430: ServoPart = { componentId: 'dynamixel-xl430-w250' };
const { joints } = THREE_JOINT_ARM.project;
const servos = [C046, { componentId: 'dsservo-ds3218' }, XL430];
const parts = THREE_JOINT_ARM.parts.map((part) => {
  const index = joints.findIndex((joint) => joint.actuators?.includes(part.id));
  const servo = servos[index];

  return servo ? { ...part, componentId: servo.componentId, componentVariant: servo.variant } : part;
});

function fitted(servo: ServoPart): ServoCalibration {
  return {
    ...presetServo(servo),
    servo,
    verdict: servo.variant ? 'consistent' : 'measured',
    version: 0,
    rung: 'response',
    scales: {},
    conditions: { volts: 7.4, temperatureC: 30 },
    evidence: { logs: 2, presetErrorRad: 0.02, fittedErrorRad: 0.01, gain: 0.5, explained: 0.99, reason: '' },
  };
}

beforeAll(async () => {
  startRobotStore({
    onRobotEvent: () => () => {},
    robotUnits: async () => [],
    robotConnect: async (spec, unit) => {
      receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });
      receiveRobotEvent({ event: 'hello', unit, emulated: false });
      receiveRobotEvent({
        event: 'status',
        unit,
        mode: 'test',
        run: 'running',
        sealed: false,
        fault_latched: false,
        joints: [],
      });

      return { ok: true };
    },
  });
  await connectRobot(
    { family: 'feetech', ids: [1, 2, 3], class: 'arm', emulated: true },
    joints.map((j) => j.id),
  );
});

describe('mixed-servo calibration session', () => {
  it.each([undefined, ['wrist']])('records each selected servo and its verdict with selection %j', async (only) => {
    const selected = only ? [2] : [0, 2];
    const histories: Record<string, CalibrationHistory> = {};
    const fitter: Calibrator = {
      calibrate: vi.fn(async ({ servo }) => fitted(servo!)),
      mounts: vi.fn(async () => []),
      dispose: vi.fn(),
    };
    const recording = {
      starts: selected.map((index) => index + 1),
      samples: [0, 0.1, 9, 9.1].map((seconds) => ({
        seconds,
        joints: selected.map((index) => ({ positionRad: (index + 1) * 1.25, volts: 7.4, temperatureC: 30 })),
      })),
    };

    vi.mocked(playBench).mockClear().mockResolvedValue(recording);
    vi.mocked(calibrator).mockReturnValue(fitter);
    await calibrateRobot({
      joints,
      parts,
      only,
      calibrations: undefined,
      recordMount: vi.fn(),
      record: (id, calibration) => {
        histories[id] = recordCalibration(histories[id] ?? EMPTY_HISTORY, calibration);
      },
    });

    expect(playBench).toHaveBeenCalledExactlyOnceWith(selected, undefined, undefined, expect.any(String));
    expect(Object.keys(histories)).toEqual(selected.map((index) => joints[index].id));

    for (const index of selected) {
      const calibration = histories[joints[index].id].versions.at(-1)!;
      const servo = servos[index];
      const logs = keptBenchLogs(calibration.logId);

      expect(calibration).toMatchObject({ servo });
      expect(calibration.verdict).toBe(fitted(servo).verdict);
      expect(logs?.servo).toEqual(servo);
      expect(logs?.logs.map((log) => log.positionRad)).toEqual(
        Array.from({ length: 2 }, () => [(index + 1) * 0.25, (index + 1) * 0.25]),
      );
      expect(fitter.calibrate).toHaveBeenCalledWith({ servo, logs: logs?.logs });
    }

    const rows = jointRows({ joints, parts, calibrations: histories, connection: null });

    expect(rows.map((row) => row.history?.versions.at(-1)?.verdict ?? null)).toEqual(
      joints.map((joint) => histories[joint.id]?.versions.at(-1)?.verdict ?? null),
    );
    expect(fitter.dispose).toHaveBeenCalledExactlyOnceWith();
    expect(calibrationPhase()).toBe('idle');
  });
});
