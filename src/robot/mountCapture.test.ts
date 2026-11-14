import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ARM } from '../../e2e/armFixture';
import { FAKE_DAEMON_SCRIPT } from '../../e2e/fakeDaemon';
import { calibrationView, emulatedCamera } from '../cameras/silhouetteSource';
import { DEFAULT_MOUNT, findMounts, type MountFrame } from '../reality/mountSearch';
import { FakeEventLoop, type Stall } from './eventLoop.fixtures';
import { captureWiggle, WIGGLE } from './mountCapture';
import {
  connectRobot,
  disconnectRobot,
  enterRung,
  robotSnapshot,
  startRobotStore,
  type RobotLinkApi,
} from './robotStore';

const JOINTS = ARM.project.joints.map((j) => j.id);
const loop = new FakeEventLoop();
const fake: { __fakeRobotLink?: RobotLinkApi & { horns: Record<number, unknown> } } = {};

beforeAll(() => {
  const install = new Function('window', 'performance', 'setInterval', 'clearInterval', FAKE_DAEMON_SCRIPT);

  install(fake, { now: () => loop.now }, loop.setInterval, loop.clearTimer);

  if (fake.__fakeRobotLink) startRobotStore(fake.__fakeRobotLink);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function capture(stalls: Stall[]): Promise<MountFrame[]> {
  vi.spyOn(performance, 'now').mockImplementation(() => loop.now);
  vi.stubGlobal('setInterval', loop.setInterval);
  vi.stubGlobal('clearInterval', loop.clearTimer);
  Object.assign(fake.__fakeRobotLink!.horns, {
    1: { offsetDeg: 12, direction: 1 },
    2: { offsetDeg: 0, direction: -1 },
  });
  await connectRobot({ family: 'feetech', ids: [1, 2], class: 'arm', emulated: true }, JOINTS);
  await enterRung('set_up');
  await enterRung('test');
  await loop.runFor(1037);

  const source = emulatedCamera({
    parts: ARM.parts,
    joints: ARM.project.joints,
    view: calibrationView(ARM.parts),
    connected: { ids: [1, 2], joints: JOINTS },
    status: () => robotSnapshot().status,
  });
  const frames: MountFrame[] = [];

  for (const k of JOINTS.keys()) {
    const shots = captureWiggle(k, source);

    loop.stallAfter(stalls);
    await loop.runFor(WIGGLE.seconds * 1000 + 1500);
    frames.push(...((await shots) ?? []));
  }

  await disconnectRobot();

  return frames;
}

const found = (frames: MountFrame[]) =>
  findMounts({
    parts: ARM.parts,
    joints: ARM.project.joints,
    view: calibrationView(ARM.parts),
    order: JOINTS,
    mounts: JOINTS.map(() => DEFAULT_MOUNT),
    search: JOINTS,
    frames,
  }).map((r) => r.mount);

describe('capturing a wiggle on the fake daemon', () => {
  it('finds the planted zero and direction, and the same ones when the page stalls', async () => {
    const steady = await capture([]);
    const stalled = await capture([
      { atMs: 30, forMs: 420 },
      { atMs: 1400, forMs: 330 },
      { atMs: 3100, forMs: 260 },
    ]);

    expect(steady).toHaveLength(6);
    expect(stalled).toHaveLength(6);
    expect(found(steady)).toEqual([
      { zeroCounts: 2185, direction: 1 },
      { zeroCounts: 2048, direction: -1 },
    ]);
    expect(found(stalled)).toEqual(found(steady));
  }, 60_000);
});
