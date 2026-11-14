import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { offerSimTargets } from './intentMirror';
import type { ServoRobotSpec } from './robotState';
import {
  connectRobot,
  receiveRobotEvent,
  robotRunFor,
  robotSnapshot,
  sendRobotCommand,
  startRobotStore,
  type RobotLinkApi,
} from './robotStore';
import { replayable, RunBuffer, RUN_SECONDS } from './runBuffer';

const counts = (rad: number) => Math.round(2048 + (rad * 4096) / (2 * Math.PI));

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

const status = (positions: number[]) =>
  receiveRobotEvent({
    event: 'status',
    mode: 'test',
    run: 'running',
    sealed: false,
    fault_latched: false,
    joints: positions.map((rad, k) => ({ id: k + 1, position: counts(rad), reply: 'ok' })),
  });

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

describe('the run buffer', () => {
  it('keeps exactly the last 20 s of status events and intents', () => {
    const buffer = new RunBuffer();

    for (let ms = 0; ms <= 30_000; ms += 100) buffer.status(ms, [ms / 1000]);

    for (let ms = 0; ms <= 30_000; ms += 25) buffer.intent(ms, [ms / 1000]);

    const { statuses, intents } = buffer.kept();

    for (const kept of [statuses, intents]) {
      expect(kept[0].at).toBe(30_000 - RUN_SECONDS * 1000);
      expect(kept.at(-1)!.at).toBe(30_000);
    }

    expect(statuses).toHaveLength(201);
    expect(intents).toHaveLength(801);
  });

  it('keeps the run when a servo faults, names its joint, and stops mirroring the sim until the next rung', async () => {
    await connect();

    for (let k = 0; k < 10; k++) {
      at(1000 + k * 100);
      status([0.1 * k, 0.2, 0]);
      await sendRobotCommand({ cmd: 'intent', joints: [0.1 * k + 0.05, 0.2, 0] });
    }

    receiveRobotEvent({ event: 'fault', code: 'stall', id: 2, message: 'The Elbow joint is stuck.' });

    const message = robotSnapshot().messages[0];
    const run = robotRunFor(message.id);

    expect(replayable(run)).toBe(true);
    expect(run).toMatchObject({ joints: JOINTS, faultJoint: 'elbow', message: 'The Elbow joint is stuck.' });
    expect(run!.statuses).toHaveLength(10);
    expect(run!.statuses[3].positions[0]).toBeCloseTo(0.3, 2);
    expect(run!.intents.map((i) => i.joints[0])).toEqual([...Array(10).keys()].map((k) => 0.1 * k + 0.05));

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
