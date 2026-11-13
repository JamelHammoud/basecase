import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FAKE_DAEMON_SCRIPT } from '../../e2e/fakeDaemon';
import { benchLogs, type BenchRecording } from '../reality/benchLogs';
import { BENCH, BENCH_SECONDS } from '../reality/benchSequence';
import { calibrateServo } from '../reality/calibrate';
import { FAMILY_SERVOS } from '../reality/servoPart';
import { benchSeconds, playBench } from './benchRun';
import { FakeEventLoop, type Stall } from './eventLoop.fixtures';
import {
  connectRobot,
  disconnectRobot,
  enterRung,
  robotSnapshot,
  startRobotStore,
  type RobotLinkApi,
} from './robotStore';
import type { RobotStatus } from './robotState';

const COUNT = (2 * Math.PI) / 4096;
const JOINTS = ['shoulder', 'elbow'];
const loop = new FakeEventLoop();
let mj: MainModule;

const loadedStalls = (): Stall[] =>
  Array.from({ length: 24 }, (_, k) => ({ atMs: 350 + k * 760, forMs: [260, 420, 140, 330][k % 4] }));

beforeAll(async () => {
  const window: { __fakeRobotLink?: RobotLinkApi } = {};

  const install = new Function('window', 'performance', 'setInterval', 'clearInterval', FAKE_DAEMON_SCRIPT);

  install(window, { now: () => loop.now }, loop.setInterval, loop.clearTimer);

  if (window.__fakeRobotLink) startRobotStore(window.__fakeRobotLink);

  mj = await loadMujoco();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function record(stalls: Stall[]): Promise<BenchRecording | null> {
  vi.spyOn(performance, 'now').mockImplementation(() => loop.now);
  vi.stubGlobal('setInterval', loop.setInterval);
  vi.stubGlobal('clearInterval', loop.clearTimer);
  await connectRobot({ family: 'feetech', ids: [1, 2], class: 'arm', emulated: true }, JOINTS);
  await enterRung('set_up');
  await enterRung('test');
  await loop.runFor(1037);
  expect(robotSnapshot().status?.run).toBe('running');

  const bench = playBench();

  loop.stallAfter(stalls);
  await loop.runFor(BENCH_SECONDS * 1000 + 2000);

  const recording = await bench;

  await disconnectRobot();

  return recording;
}

describe('the bench on the fake daemon', () => {
  it('records the same logs when the page stalls, and they still calibrate', async () => {
    const steady = await record([]);
    const stalled = await record(loadedStalls());

    expect(steady).not.toBeNull();
    expect(stalled).not.toBeNull();

    for (const k of JOINTS.keys()) {
      const want = benchLogs({ recording: steady as BenchRecording, joint: k, servo: FAMILY_SERVOS.sts3215 });
      const got = benchLogs({ recording: stalled as BenchRecording, joint: k, servo: FAMILY_SERVOS.sts3215 });

      for (const [i, log] of got.entries()) {
        expect(log.dt).toBeCloseTo(0.1, 6);
        expect(log.goalRad).toHaveLength(BENCH.logS * 10);
        log.goalRad.forEach((g, j) => expect(g).toBeCloseTo(want[i].goalRad[j], 9));
        log.positionRad.forEach((p, j) =>
          expect(Math.round(Math.abs(p - want[i].positionRad[j]) / COUNT)).toBeLessThanOrEqual(2),
        );
      }

      const calibration = await calibrateServo({ servo: FAMILY_SERVOS.sts3215, logs: got, mj });

      expect(calibration.verdict).toMatch(/^(measured|consistent)$/);
    }
  }, 120_000);
});

describe('bench timing', () => {
  it('times statuses by the daemon clock, aligned to the one heard soonest', () => {
    const status = (atUs?: number): RobotStatus => ({
      at_us: atUs,
      mode: 'test',
      run: 'running',
      sealed: false,
      fault_latched: false,
      joints: [],
    });
    const seconds = benchSeconds([
      { status: status(1_000_000), heardS: 0.45 },
      { status: status(1_100_000), heardS: 0.2 },
      { status: status(1_200_000), heardS: 0.9 },
      { status: status(), heardS: 1 },
    ]);

    [0.1, 0.2, 0.3, 1].forEach((want, i) => expect(seconds[i]).toBeCloseTo(want, 9));
  });
});
