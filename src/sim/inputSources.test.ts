import { describe, expect, it } from 'vitest';
import { buildRig } from '../utils/kinematics';
import type { DriveCommand } from './driveTypes';
import {
  closeInputs,
  drivesBody,
  hasInputSource,
  openInputs,
  readInputs,
  registerInputSource,
  type InputRobot,
} from './inputSources';

const ROBOT: InputRobot = { cls: 'pose', rig: buildRig([], []), pointOf: () => null, changed: () => undefined };
const STILL: DriveCommand = { v: [0, 0, 0] };
const POSE: DriveCommand = { v: [0, 0, 0], joints: { right_shoulder_pitch_joint: -40 } };

function fakeSource(id: string, opts: { fails?: boolean; body?: boolean } = {}) {
  const log: string[] = [];
  let latest: DriveCommand | null = null;

  registerInputSource({
    id,
    body: opts.body,
    read: () => latest,
    open: async () => {
      if (opts.fails) throw new Error(`${id} is busy`);

      log.push('open');
      latest = POSE;
    },
    close: () => {
      log.push('close');
      latest = null;
    },
  });

  return log;
}

describe('input sources', () => {
  it('registers keys, the gamepad and the camera, and only the camera drives a body', () => {
    expect(['keys', 'gamepad', 'camera'].every(hasInputSource)).toBe(true);
    expect(drivesBody(['camera', 'keys'])).toBe(true);
    expect(drivesBody(['gamepad', 'keys'])).toBe(false);
  });

  it('runs the keys through the same reading as any source', () => {
    const keys: DriveCommand = { v: [1, 0, 0] };
    const read = readInputs(['camera', 'keys'], { cls: 'pose', keys });

    expect(read.command).toEqual(keys);
    expect(read.readings).toEqual({ camera: null, keys });
  });

  it('lets a body pose drive over the keys once its source is open, and stops when it closes', async () => {
    const log = fakeSource('test-body', { body: true });

    await openInputs(['test-body', 'keys'], ROBOT);

    expect(readInputs(['test-body', 'keys'], { cls: 'pose', keys: { v: [1, 0, 0] } }).command).toEqual(POSE);

    closeInputs(['test-body', 'keys']);

    expect(readInputs(['test-body', 'keys'], { cls: 'pose', keys: STILL }).command).toEqual(STILL);
    expect(log).toEqual(['open', 'close']);
  });

  it('closes the sources it opened when a later one fails, and passes the failure on', async () => {
    const first = fakeSource('test-first');

    fakeSource('test-broken', { fails: true });

    await expect(openInputs(['test-first', 'test-broken'], ROBOT)).rejects.toThrow('test-broken is busy');
    expect(first).toEqual(['open', 'close']);
  });
});
