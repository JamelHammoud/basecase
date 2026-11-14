import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { offerSimTargets } from './intentMirror';
import { readOperateLog, type OperateLog } from './operateLog';
import type { ServoRobotSpec } from './robotState';
import {
  connectRobot,
  receiveRobotEvent,
  robotRunFor,
  robotSnapshot,
  startRobotStore,
  type RobotLinkApi,
} from './robotStore';
import { replayable, runOf, RUN_SECONDS } from './runBuffer';

const session = vi.hoisted(() => ({ text: '' }));

vi.mock('../cases/tryStore', () => ({ loadSession: async () => session.text }));

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

  const connecting = connectRobot(spec, JOINTS);

  receiveRobotEvent({ event: 'link', state: 'connected', spec });
  await connecting;
  receiveRobotEvent({ event: 'mode', mode: 'test' });
}

beforeAll(() => {
  startRobotStore(link);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FAULT = { joints: ['a'], faultJoint: null, faultAt: 0, message: '' };

function longLog(): OperateLog {
  const lines: string[] = [];

  for (let ms = 0; ms <= 30_000; ms += 100) lines.push(JSON.stringify({ t: ms / 1000, k: 'status', q: [ms / 1000] }));

  for (let ms = 0; ms <= 30_000; ms += 25) lines.push(JSON.stringify({ t: ms / 1000, k: 'intent', q: [ms / 1000] }));

  return readOperateLog(`${lines.join('\n')}\n{"t":30.1,"k":"sta`);
}

describe('the run buffer, a view of the open try', () => {
  it('keeps exactly the try’s last 20 s of status events and intents, past a cut-off last line', () => {
    const { statuses, intents } = runOf(longLog(), FAULT);

    for (const kept of [statuses, intents]) {
      expect(kept[0].at).toBe(30_000 - RUN_SECONDS * 1000);
      expect(kept.at(-1)!.at).toBe(30_000);
    }

    expect(statuses).toHaveLength(201);
    expect(intents).toHaveLength(801);
  });

  it('reads the run from the try when a servo faults, names its joint, and stops mirroring until the next rung', async () => {
    await connect();

    const lines = [...Array(10).keys()].flatMap((k) => [
      JSON.stringify({ t: 1 + k / 10, k: 'status', q: [0.1 * k, 0.2, 0] }),
      JSON.stringify({ t: 1.01 + k / 10, k: 'intent', q: [0.1 * k + 0.05, 0.2, 0] }),
    ]);

    session.text = lines.join('\n');
    status([0, 0.2, 0]);
    receiveRobotEvent({ event: 'fault', code: 'stall', id: 2, message: 'The Elbow joint is stuck.' });

    const message = robotSnapshot().messages[0];

    expect(robotRunFor(message.id)).toBeNull();
    receiveRobotEvent({ event: 'recorded', id: 'operate-1', reason: 'fault', manifest: { id: 'operate-1' } });
    await vi.waitFor(() => expect(replayable(robotRunFor(message.id))).toBe(true));

    const run = robotRunFor(message.id)!;

    expect(run).toMatchObject({ joints: JOINTS, faultJoint: 'elbow', message: 'The Elbow joint is stuck.' });
    expect(run.statuses).toHaveLength(10);
    expect(run.statuses[3].positions[0]).toBeCloseTo(0.3, 2);
    expect(run.intents.map((i) => i.joints[0])).toEqual([...Array(10).keys()].map((k) => 0.1 * k + 0.05));

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
