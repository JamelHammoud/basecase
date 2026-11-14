import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ARM } from '../../e2e/armFixture';
import { connectRobot, receiveRobotEvent, selectUnit, startRobotStore, type RobotLinkApi } from './robotStore';
import { endServoSetup, servoSetup, setUpServos } from './servoSetup';

const sent: Array<{ unit: string | undefined; command: Record<string, unknown> }> = [];
const selectedParts: string[][] = [];
const joints = ARM.project.joints;
const ids = [1, 2];

const link: RobotLinkApi = {
  onRobotEvent: () => () => {},
  robotUnits: async () => [],
  robotConnect: async (spec, unit) => {
    receiveRobotEvent({ event: 'link', state: 'connected', spec, unit });

    return { ok: true };
  },
  robotCommand: async (command, unit) => {
    sent.push({ command, unit });

    if (command.cmd === 'enter') receiveRobotEvent({ event: 'mode', mode: command.mode, unit });

    return { ok: true };
  },
};

function status(unit: string, answered: number[]) {
  receiveRobotEvent({
    event: 'status',
    unit,
    mode: 'set_up',
    run: 'idle',
    joints: ids.map((id) => ({ id, reply: answered.includes(id) ? 'ok' : 'missing' })),
  });
}

beforeAll(() => startRobotStore(link));

beforeEach(async () => {
  for (const unit of ['arm-a', 'arm-b']) {
    await connectRobot(
      { family: 'feetech', ids, class: 'arm', emulated: true },
      joints.map((j) => j.id),
      unit,
    );
  }

  selectUnit('arm-a');
  sent.length = 0;
  selectedParts.length = 0;
});

afterEach(endServoSetup);

describe('servo setup isolation across units', () => {
  it('keeps factory commands and assigned events on the captured unit after switching selection', async () => {
    await setUpServos({ joints, select: (parts) => selectedParts.push(parts) });
    status('arm-a', []);

    expect(servoSetup()?.step?.id).toBe(2);
    selectUnit('arm-b');
    status('arm-b', [1]);
    receiveRobotEvent({ event: 'assigned', unit: 'arm-b', id: 2 });

    expect(servoSetup()?.step?.id).toBe(2);
    status('arm-a', [1]);
    receiveRobotEvent({ event: 'assigned', unit: 'arm-a', id: 2 });

    expect(servoSetup()?.step?.id).toBe(1);
    expect(sent.map((s) => s.unit)).toEqual(['arm-a', 'arm-a', 'arm-a']);
    expect(sent.at(-1)?.command).toEqual({ cmd: 'assign_id', id: 2, model: 777 });
    expect(selectedParts.at(-1)).toEqual(joints[0].child);
  });

  it('ignores another unit refusal and ends only on its own refusal', async () => {
    await setUpServos({ joints, select: (parts) => selectedParts.push(parts) });
    status('arm-a', []);
    selectUnit('arm-b');
    receiveRobotEvent({ event: 'refused', unit: 'arm-b', message: 'More than one servo answers.' });

    expect(servoSetup()?.step?.id).toBe(2);
    receiveRobotEvent({ event: 'refused', unit: 'arm-a', message: 'More than one servo answers.' });
    expect(servoSetup()).toBeNull();
    expect(selectedParts.at(-1)).toEqual([]);
  });
});
