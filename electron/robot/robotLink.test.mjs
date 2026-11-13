import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measuredRadians } from './intentPacer.mjs';
import { daemonBinary, RobotLink } from './robotLink.mjs';
import { checkedCommand, checkedRobotSpec, emulatedCalibration } from './robotSpec.mjs';
import { G1_JOINT_NAMES } from './unitreeG1.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const G1 = { family: 'unitree-g1', emulated: true };
const G1_IDS = Array.from({ length: 17 }, (_, k) => k + 13);
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

  it('starts a factory bus only when the spec asks for one, and still writes the calibration', () => {
    const { link, spawned } = linkWithFake();

    expect(link.connect({ ...ARM, factory: true })).toEqual({ ok: true });

    const [{ args }] = spawned;
    const artefacts = args[args.indexOf('--artefacts') + 1];

    expect(args.at(-1)).toBe('--factory');
    expect(link.state().spec).toEqual({ ...ARM, factory: true });
    expect(JSON.parse(fs.readFileSync(path.join(artefacts, 'calibration.json'), 'utf8'))).toEqual(
      emulatedCalibration(ARM),
    );
    link.disconnect();

    const plain = linkWithFake();

    plain.link.connect(ARM);
    expect(plain.spawned[0].args).not.toContain('--factory');
    plain.link.disconnect();
  });

  it('refuses a factory flag that is anything but true', () => {
    for (const factory of ['yes', 1, false, null, 'true'])
      expect(checkedRobotSpec({ ...ARM, factory }).ok, String(factory)).toBe(false);

    expect(checkedRobotSpec(ARM)).toEqual({ ok: true, spec: ARM });
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

  it('forwards assign_id and plug_in only in their documented shape', () => {
    expect(checkedCommand({ cmd: 'assign_id', id: 3, model: 777 }, 2)).toEqual({ cmd: 'assign_id', id: 3, model: 777 });
    expect(checkedCommand({ cmd: 'plug_in' }, 2)).toEqual({ cmd: 'plug_in' });
    expect(checkedCommand({ cmd: 'plug_in', id: 1 }, 2)).toBeNull();

    const refused = [
      { cmd: 'assign_id', id: 3, model: 777, port: '/dev/ttyUSB0' },
      { cmd: 'assign_id', id: 0, model: 777 },
      { cmd: 'assign_id', id: 254, model: 777 },
      { cmd: 'assign_id', id: 2.5, model: 777 },
      { cmd: 'assign_id', id: '3', model: 777 },
      { cmd: 'assign_id', id: 3, model: 65536 },
      { cmd: 'assign_id', id: 3, model: -1 },
      { cmd: 'assign_id', id: 3 },
    ];

    for (const command of refused) expect(checkedCommand(command, 2), JSON.stringify(command)).toBeNull();
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

  it('tells the user how to get a copy that can run robots when the daemon is missing, in plain words', () => {
    const binary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-robot-test-')), 'robot-daemon');
    const spawnFn = vi.fn();
    const result = new RobotLink({ binary, emit: () => {}, spawnFn }).connect(ARM);

    expect(result).toEqual({
      ok: false,
      message: 'This copy of Basecase can’t run robots. Download Basecase again from basecase.so.',
    });
    expect(result.message).not.toMatch(/daemon|build/i);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});

describe('robot link for the emulated G1', () => {
  it('normalizes the emulated G1 to its 17 writable joints and spawns it with no ids, class or port', () => {
    const { link, spawned, events } = linkWithFake();
    const spec = { family: 'unitree-g1', ids: G1_IDS, class: 'legged', emulated: true };

    expect(checkedRobotSpec(G1)).toEqual({ ok: true, spec });
    expect(link.connect(G1)).toEqual({ ok: true });
    expect(events.at(-1)).toEqual({ event: 'link', state: 'connected', spec });

    const [{ args }] = spawned;
    const artefacts = args[args.indexOf('--artefacts') + 1];
    const calibration = JSON.parse(fs.readFileSync(path.join(artefacts, 'calibration.json'), 'utf8'));

    expect(args).toEqual(['--family', 'unitree-g1', '--emulated', '--artefacts', artefacts]);
    expect(calibration.class).toBe('legged');
    expect(calibration.joints.map((j) => [j.id, j.name])).toEqual(G1_IDS.map((id) => [id, G1_JOINT_NAMES[id - 1]]));
    expect(calibration.joints[0]).toEqual({
      id: 13,
      name: 'waist_yaw_joint',
      zero_counts: 2048,
      direction: 1,
      min_rad: -2.8,
      max_rad: 2.8,
    });
    expect(calibration.joints.at(-1).name).toBe('right_wrist_yaw_joint');
    expect(link.command({ cmd: 'intent', joints: G1_IDS.map(() => 0) })).toEqual({ ok: true });
    expect(link.command({ cmd: 'intent', joints: Array(29).fill(0) }).ok).toBe(false);
    link.disconnect();
  });

  it('refuses any other G1 ask with the words it uses for every robot', () => {
    const asks = [
      { ...G1, ids: G1_IDS },
      { ...G1, ids: G1_IDS, class: 'legged' },
      { ...G1, class: 'legged' },
      { ...G1, port: '/dev/ttyUSB0' },
      { ...G1, interface: 'en0' },
      { ...G1, emulated: false },
      { ...G1, emulated: 'true' },
      { family: 'unitree-g1' },
      { family: 'unitree-g1 --port /dev/ttyUSB0', emulated: true },
      Object.assign(Object.create({ family: 'unitree-g1' }), { emulated: true }),
      Object.assign(Object.create({ interface: 'en0' }), G1),
    ];
    const { link, spawned } = linkWithFake();

    for (const ask of asks) {
      const reply = checkedRobotSpec(ask);

      expect(reply.ok, JSON.stringify(ask)).toBe(false);
      expect(reply.message).toMatch(/^(Only an emulated robot can connect|Real motors are locked|Choose Feetech)/);
      expect(link.connect(ask).ok).toBe(false);
    }

    expect(spawned).toEqual([]);
  });
});
