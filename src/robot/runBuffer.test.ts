import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { offerSimTargets } from './intentMirror';
import type { ServoRobotSpec } from './robotState';
import {
  connectRobot,
  receiveRobotEvent,
  robotRunFor,
  robotSnapshot,
  startRobotStore,
  type RobotLinkApi,
} from './robotStore';
import { decodeTake, RobotTake } from '../../electron/robot/robotTake.mjs';
import { faultReplayable, replayable, runOfTake, RUN_SECONDS } from './runBuffer';

const sent: number[][] = [];

const link: RobotLinkApi = {
  onRobotEvent: () => () => {},
  robotState: async () => ({ connected: false, spec: null, hello: null, status: null }),
  robotConnect: async () => ({ ok: true }),
  robotDisconnect: async () => ({ ok: true }),
  robotCommand: async (command: Record<string, unknown>) => {
    if (command.cmd === 'intent') sent.push(command.joints as number[]);

    return { ok: true };
  },
};

const JOINTS = ['shoulder', 'elbow', 'wrist'];

const at = (ms: number) => vi.spyOn(performance, 'now').mockReturnValue(ms);

async function connect() {
  const spec: ServoRobotSpec = { family: 'feetech', ids: [1, 2, 3], class: 'arm', emulated: true };

  receiveRobotEvent({ event: 'link', state: 'connected', spec });
  await connectRobot(spec, JOINTS);
  receiveRobotEvent({ event: 'mode', mode: 'test' });
}

beforeAll(() => {
  startRobotStore(link);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function recordedTake() {
  const take = new RobotTake({ id: 'try-run', joints: JOINTS, startedAt: '2026-11-14T00:00:00.000Z' });

  for (let ms = 0; ms <= 30_000; ms += 100) take.apply(['s', ms / 1000, [ms / 1000, 0, null]]);

  for (let ms = 0; ms <= 30_000; ms += 25) take.apply(['i', ms / 1000, [ms / 1000, 0, 0]]);

  return decodeTake(take.bytes())!;
}

const FAULT = { joints: JOINTS, faultJoint: 'elbow', faultAt: 0, message: 'The Elbow joint is stuck.' };

describe('the run buffer', () => {
  it('is a view of the take’s last 20 s of statuses and intents', () => {
    const { statuses, intents } = runOfTake(recordedTake(), FAULT);

    for (const kept of [statuses, intents]) {
      expect(kept[0].at).toBe(30_000 - RUN_SECONDS * 1000);
      expect(kept.at(-1)!.at).toBe(30_000);
    }

    expect(statuses).toHaveLength(201);
    expect(intents).toHaveLength(801);
    expect(statuses[0].positions).toEqual([10, 0, null]);
  });

  it('links a fault to the take it closed, names its joint, and stops mirroring the sim until the next rung', async () => {
    await connect();
    receiveRobotEvent({ event: 'fault', code: 'stall', id: 2, message: 'The Elbow joint is stuck.' });

    const message = robotSnapshot().messages[0];

    expect(faultReplayable(robotRunFor(message.id))).toBe(false);

    const shown = robotSnapshot();

    receiveRobotEvent({ event: 'take', state: 'kept', id: 'try-run', fault: true, replayable: true });

    const fault = robotRunFor(message.id);

    expect(robotSnapshot()).not.toBe(shown);
    expect(faultReplayable(fault)).toBe(true);
    expect(fault).toMatchObject({ takeId: 'try-run', joints: JOINTS, faultJoint: 'elbow' });
    expect(replayable(runOfTake(recordedTake(), fault!))).toBe(true);

    const before = sent.length;

    at(5000);
    offerSimTargets(JOINTS, [1, 1, 1]);
    expect(sent).toHaveLength(before);

    receiveRobotEvent({ event: 'mode', mode: 'test' });
    at(6000);
    offerSimTargets(JOINTS, [1, 1, 1]);
    await vi.waitFor(() => expect(sent).toHaveLength(before + 1));
  });
});
