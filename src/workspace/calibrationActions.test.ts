import { beforeAll, describe, expect, it, vi } from 'vitest';
import { unitHistories, withMount } from '../reality/projectCalibrations';
import { FAMILY_SERVOS } from '../reality/servoPart';
import { calibrateRobot } from '../robot/calibrationSession';
import { connectRobot, receiveRobotEvent, selectUnit, startRobotStore } from '../robot/robotStore';
import { DEFAULT_PROJECT, type ProjectSettings } from '../types/robotics';
import { calibrateConnectedRobot, rollBackCalibration } from './calibrationActions';

vi.mock('../robot/calibrationSession', () => ({ calibrateRobot: vi.fn() }));

const found = {
  servo: FAMILY_SERVOS.sts3215,
  verdict: 'measured' as const,
  mount: { zeroCounts: 2100, direction: -1 as const },
  reason: 'Measured from camera',
};

beforeAll(async () => {
  startRobotStore({
    onRobotEvent: () => () => {},
    robotUnits: async () => [],
    robotConnect: async (spec, unit) => {
      receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });

      return { ok: true };
    },
  });

  for (const unit of ['arm-a', 'arm-b']) {
    await connectRobot({ family: 'feetech', ids: [1], class: 'arm', emulated: true }, ['shoulder'], unit);
  }
});

describe('calibration project updates', () => {
  it('records bench and mount results on the captured unit after selection changes', () => {
    let project = withMount(DEFAULT_PROJECT, 'shoulder', found, 'arm-a');
    const original = project;

    selectUnit('arm-a');
    calibrateConnectedRobot((change) => (project = change(project)), { project, joints: [], parts: [] });

    const input = vi.mocked(calibrateRobot).mock.calls.at(-1)?.[0];

    expect(input?.unit).toBe('arm-a');
    expect(input?.calibrations).toBe(unitHistories(original, 'arm-a'));
    selectUnit('arm-b');
    input?.recordMount('shoulder', found);
    input?.record('shoulder', unitHistories(original, 'arm-a').shoulder.versions[0]);

    expect(unitHistories(project, 'arm-a').shoulder.versions).toHaveLength(3);
    expect(unitHistories(project, 'arm-b')).toEqual({});
    expect(project.servoCalibrations).toBeUndefined();
  });

  it('keeps a queued rollback on the unit selected when it was requested', () => {
    const project = withMount(withMount(DEFAULT_PROJECT, 'shoulder', found, 'arm-a'), 'shoulder', found, 'arm-b');
    const changes: Array<(project: ProjectSettings) => ProjectSettings> = [];

    selectUnit('arm-a');
    rollBackCalibration((change) => changes.push(change), 'shoulder');
    selectUnit('arm-b');

    const rolled = changes[0](project);

    expect(unitHistories(rolled, 'arm-a').shoulder.active).toBeNull();
    expect(unitHistories(rolled, 'arm-b')).toBe(unitHistories(project, 'arm-b'));
  });
});
