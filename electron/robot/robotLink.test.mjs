import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measuredRadians } from './intentPacer.mjs';
import { daemonBinary, RobotLink } from './robotLink.mjs';
import { checkedCommand, emulatedCalibration } from './robotSpec.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const HELLO = { event: 'hello', emulated: true, real_transport: false, lost_message: 'Lost contact with the robot.' };

function fakeDaemon() {
  const child = new EventEmitter();

  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn();
  child.sent = [];
  child.stdin.on('data', (chunk) =>
    child.sent.push(
      ...String(chunk)
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l)),
    ),
  );
  child.say = (event) => child.stdout.write(`${JSON.stringify(event)}\n`);

  return child;
}

function linkWithFake() {
  const binary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-robot-test-')), 'robot-daemon');

  fs.writeFileSync(binary, '');

  const spawned = [];
  const events = [];
  const link = new RobotLink({
    binary,
    emit: (e) => events.push(e),
    spawnFn: (bin, args) => {
      const child = fakeDaemon();

      spawned.push({ bin, args, child });

      return child;
    },
  });

  return { link, spawned, events };
}

const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => vi.useRealTimers());

describe('robot link', () => {
  it('spawns the daemon emulated with a calibration it wrote, never a port', () => {
    const { link, spawned } = linkWithFake();

    expect(link.connect(ARM)).toEqual({ ok: true });

    const [{ args }] = spawned;
    const artefacts = args[args.indexOf('--artefacts') + 1];

    expect(args.slice(0, 7)).toEqual(['--family', 'feetech', '--ids', '1,2', '--class', 'arm', '--emulated']);
    expect(args).not.toContain('--port');
    expect(JSON.parse(fs.readFileSync(path.join(artefacts, 'calibration.json'), 'utf8'))).toEqual(
      emulatedCalibration(ARM),
    );
    link.disconnect();
  });

  it('beats while idle, holds the measured pose from Test on, and forwards the latest intent', async () => {
    const { link, spawned } = linkWithFake();

    link.connect(ARM);

    const { child } = spawned[0];

    child.say(HELLO);
    child.say({ event: 'status', mode: 'look', run: 'idle', joints: [{ id: 1, position: 2048 }] });
    await settle(80);
    expect(child.sent.every((c) => c.cmd === 'heartbeat')).toBe(true);
    expect(child.sent.length).toBeGreaterThan(1);

    child.say({ event: 'mode', mode: 'test' });
    await settle(80);
    expect(child.sent.at(-1)).toEqual({ cmd: 'intent', joints: [0, 0] });

    expect(link.command({ cmd: 'intent', joints: [0.25, -0.5] })).toEqual({ ok: true });
    await settle(80);
    expect(child.sent.at(-1)).toEqual({ cmd: 'intent', joints: [0.25, -0.5] });
    link.disconnect();
  });

  it('says the daemon is lost in its own words when it exits unasked, and closed when asked', async () => {
    const { link, spawned, events } = linkWithFake();

    link.connect(ARM);
    spawned[0].child.say(HELLO);
    await settle();
    spawned[0].child.emit('exit', 1, null);
    expect(events.at(-1)).toEqual({ event: 'link', state: 'lost', message: HELLO.lost_message });

    link.connect(ARM);
    link.disconnect();
    spawned[1].child.emit('exit', 0, null);
    expect(events.at(-1)).toEqual({ event: 'link', state: 'closed' });
    expect(link.state().connected).toBe(false);
  });

  it('forwards only documented commands, rebuilt without extra fields', () => {
    expect(checkedCommand({ cmd: 'enter', mode: 'test' }, 2)).toEqual({ cmd: 'enter', mode: 'test' });
    expect(checkedCommand({ cmd: 'enter', mode: 'god_mode' }, 2)).toBeNull();
    expect(checkedCommand({ cmd: 'stop', port: '/dev/ttyUSB0' }, 2)).toBeNull();
    expect(checkedCommand({ cmd: 'write_register', address: 40 }, 2)).toBeNull();
    expect(checkedCommand({ cmd: 'intent', joints: [0.1, null] }, 2)).toEqual({ cmd: 'intent', joints: [0.1, null] });
    expect(checkedCommand({ cmd: 'intent', joints: [0.1] }, 2)).toBeNull();
    expect(checkedCommand({ cmd: 'intent', joints: [0.1, Infinity] }, 2)).toBeNull();
  });

  it('reads measured positions in calibration order', () => {
    const status = {
      joints: [
        { id: 2, position: 3072 },
        { id: 1, position: 2048 },
      ],
    };

    expect(measuredRadians(status, [1, 2])).toEqual([0, Math.PI / 2]);
    expect(measuredRadians(null, [1])).toEqual([0]);
  });

  it('finds the bundled daemon, or the override for tests', () => {
    const resources = path.join('Basecase.app', 'Contents', 'Resources');

    expect(daemonBinary({ env: {}, resources, fromSource: false, repo: 'repo' })).toBe(
      path.join(resources, 'hw', process.platform === 'win32' ? 'robot-daemon.exe' : 'robot-daemon'),
    );
    expect(daemonBinary({ env: { BASECASE_ROBOT_DAEMON: 'relay' }, resources, fromSource: false })).toBe('relay');
  });
});
