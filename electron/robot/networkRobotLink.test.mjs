import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { robotId } from './networkIdentity.mjs';
import { NetworkCredentials } from './networkCredentials.mjs';
import { fakeNetworkRobot, TEST_KEY } from './networkFake.mjs';
import { NetworkRobotLink } from './networkRobotLink.mjs';
import { checkedEndpoint, isRobotAddress, resolveRobotHost } from './networkAddress.mjs';
import { checkedRobotSpec } from './robotSpec.mjs';
import { RobotFleet } from './robotFleet.mjs';

const cleanups = [];
const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };

async function setup(options) {
  const robot = await fakeNetworkRobot(options);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-network-test-'));
  const events = [];
  const credentials = new NetworkCredentials(path.join(directory, 'pairings'));
  const pairRobot = vi.fn(({ code }) => ({
    key: code === '123456' ? Promise.resolve(TEST_KEY) : Promise.reject(new Error('Check the robot’s pairing code.')),
    cancel: () => {},
  }));
  const link = new NetworkRobotLink({
    pairRobot,
    binary: '',
    emit: (event) => events.push(event),
    credentials,
    tmpDir: directory,
  });

  cleanups.push(async () => {
    link.dispose();
    await robot.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  return { robot, directory, events, credentials, link, pairRobot };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe('network robot link', () => {
  it('pairs privately, authenticates each connection, and reuses the ladder and intent pacer', async () => {
    const { robot, link, credentials, directory, events, pairRobot } = await setup();

    expect(await link.connect({ ...robot.endpoint, code: '123456' })).toEqual({ ok: true });
    await vi.waitFor(() => expect(link.state().status?.mode).toBe('look'));
    expect(link.state().spec).toEqual(ARM);
    expect(link.state().endpoint).toEqual(robot.endpoint);
    expect(credentials.read(robot.endpoint)).toBe(TEST_KEY);
    expect(JSON.stringify(events)).not.toContain(TEST_KEY);

    if (process.platform !== 'win32') expect(fs.statSync(credentials.file(robot.endpoint)).mode & 0o777).toBe(0o600);

    expect(fs.readdirSync(directory)).toHaveLength(2);
    expect(link.command({ cmd: 'enter', mode: 'test' })).toEqual({ ok: true });
    await vi.waitFor(() => expect(robot.commands.some((command) => command.cmd === 'intent')).toBe(true));
    expect(link.command({ cmd: 'intent', joints: [0.1, 0.2] })).toEqual({ ok: true });
    await vi.waitFor(() => expect(robot.commands.at(-1)).toEqual({ cmd: 'intent', joints: [0.1, 0.2] }));
    link.disconnect();
    await vi.waitFor(() => expect(link.state().connected).toBe(false));
    expect(await link.connect(robot.endpoint)).toEqual({ ok: true });
    expect(pairRobot).toHaveBeenCalledOnce();
  });

  it('accepts the same Feetech, Dynamixel, G1 and ROS 2 specifications as the local transport', async () => {
    const specs = [
      ARM,
      { ...ARM, family: 'dynamixel' },
      { family: 'unitree-g1', emulated: true },
      {
        family: 'ros2',
        emulated: true,
        controller: { kind: 'forward_position', topic: '/arm/commands' },
        joints: ['base', 'elbow'],
      },
    ];

    for (const spec of specs) {
      const { robot, link } = await setup({ spec });

      expect(await link.connect({ ...robot.endpoint, code: '123456' })).toEqual({ ok: true });
      expect(link.state().spec).toEqual(checkedRobotSpec(spec).spec);
      link.disconnect();
    }
  });

  it('transfers calibration and policies through the authenticated daemon interface', async () => {
    const { robot, link } = await setup();
    const bytes = Buffer.alloc(300000, 3);

    link.policyBytes = () => bytes;
    await link.connect({ ...robot.endpoint, code: '123456' });
    expect(link.calibrate([{ id: 1, zero_counts: 1000, direction: -1 }])).toEqual({ ok: true });
    await vi.waitFor(() => expect(robot.commands.some((command) => command.cmd === 'recheck')).toBe(true));
    expect(robot.commands.filter((command) => command.cmd === 'put_artefact').map((command) => command.name)).toEqual([
      'calibration.json',
    ]);
    expect(link.policy([{ kind: 'policy', id: 'policy-test' }])).toEqual({ ok: true });
    await vi.waitFor(() => expect(robot.commands.some((command) => command.name === 'policy.onnx')).toBe(true));
    expect(Buffer.from(robot.commands.find((command) => command.name === 'policy.onnx').data, 'base64')).toEqual(bytes);
    expect(link.policy([])).toEqual({ ok: true });
    await vi.waitFor(() =>
      expect(robot.commands.some((command) => command.name === 'policy.onnx' && command.data === null)).toBe(true),
    );
  });

  it('refuses oversized policies before changing the active policy or writing to the robot', async () => {
    const { robot, link } = await setup();

    await link.connect({ ...robot.endpoint, code: '123456' });
    link.policyBytes = () => Buffer.alloc(16 * 1024 * 1024 + 1);
    expect(link.policy([{ kind: 'policy', id: 'policy-large' }])).toEqual({
      ok: false,
      message: 'Choose a robot policy smaller than 16 MB.',
    });
    expect(link.activePolicy).toBeNull();
    expect(robot.commands.some((command) => command.cmd === 'put_artefact')).toBe(false);
  });
});

describe('network robot identities', () => {
  it('reconnects by IP after pairing through a hostname and restarting the credential store', async () => {
    const { robot, link, credentials, pairRobot } = await setup();

    link.resolveHost = async () => robot.endpoint.host;
    expect(await link.connect({ host: 'robot.local', port: robot.endpoint.port, code: '123456' })).toEqual({
      ok: true,
    });
    link.disconnect();
    await vi.waitFor(() => expect(link.state().connected).toBe(false));
    link.credentials = new NetworkCredentials(credentials.folder);
    expect(await link.connect(robot.endpoint)).toEqual({ ok: true });
    expect(link.state().hello.id).toBe(robotId(TEST_KEY));
    expect(pairRobot).toHaveBeenCalledOnce();
  });

  it('reuses the saved identity when a restarted robot has a changed address and port', async () => {
    const first = await setup();

    expect(await first.link.connect({ ...first.robot.endpoint, code: '123456' })).toEqual({ ok: true });

    const id = first.link.state().hello.id;

    first.link.disconnect();
    await vi.waitFor(() => expect(first.link.state().connected).toBe(false));

    const restarted = await setup();
    const movedHost = [192, 168, 1, 99].join('.');

    restarted.link.credentials = new NetworkCredentials(first.credentials.folder);
    restarted.link.resolveHost = async () => restarted.robot.endpoint.host;
    expect(await restarted.link.connect({ host: movedHost, port: restarted.robot.endpoint.port, id })).toEqual({
      ok: true,
    });
    expect(restarted.link.state().hello.id).toBe(id);
    expect(restarted.pairRobot).not.toHaveBeenCalled();
  });

  it('rejects a signed greeting whose identity differs from the pairing key or discovery request', async () => {
    const wrong = '0'.repeat(64);
    const signed = await setup({ greeting: { id: wrong } });

    expect((await signed.link.connect({ ...signed.robot.endpoint, code: '123456' })).ok).toBe(false);
    expect(signed.link.state().connected).toBe(false);

    const expected = await setup();

    expect((await expected.link.connect({ ...expected.robot.endpoint, id: wrong, code: '123456' })).ok).toBe(false);
    expect(expected.link.state().connected).toBe(false);
  });
});

describe('network robot authentication', () => {
  it('rejects forged telemetry, replayed events, and oversized messages', async () => {
    for (const attack of ['signature', 'replay', 'oversize']) {
      const { robot, link, events } = await setup();

      await link.connect({ ...robot.endpoint, code: '123456' });
      await vi.waitFor(() => expect(link.state().status).not.toBeNull());

      const session = robot.sessions.at(-1);
      const event = session.send({ event: 'status', mode: 'look', joints: [] });

      if (attack === 'signature') session.raw({ ...event, seq: event.seq + 1, mac: '00'.repeat(32) });

      if (attack === 'replay') session.raw(event);

      if (attack === 'oversize') session.socket.write('x'.repeat(65537));

      await vi.waitFor(() => expect(link.state().connected).toBe(false));
      expect(events.at(-1).state).toBe('lost');
    }
  });

  it('rejects wrong pairing codes, unsigned greetings, and real motor greetings', async () => {
    const { robot, link } = await setup();

    expect((await link.connect({ ...robot.endpoint, code: '999999' })).ok).toBe(false);

    const real = await setup({ greeting: { real_transport: true, emulated: false } });

    expect((await real.link.connect({ ...real.robot.endpoint, code: '123456' })).ok).toBe(false);
    expect(real.link.state().connected).toBe(false);
  });

  it('cancels a connection during DNS resolution and during the handshake', async () => {
    const { robot, link } = await setup({ challenge: false });
    let resolve;

    link.resolveHost = () =>
      new Promise((done) => {
        resolve = done;
      });

    const pending = link.connect(robot.endpoint);

    link.disconnect();
    resolve('127.0.0.1');
    expect((await pending).ok).toBe(false);
    expect(robot.sessions).toHaveLength(0);
    link.resolveHost = resolveRobotHost;

    const handshaking = link.connect(robot.endpoint);

    await vi.waitFor(() => expect(robot.sessions).toHaveLength(1));
    link.disconnect();
    expect((await handshaking).ok).toBe(false);
    expect(link.state().connected).toBe(false);
  });

  it('keeps a replacement fleet connection when an older canceled lookup finishes', async () => {
    const { robot, pairRobot } = await setup();
    let resolveOld;
    const resolveHost = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue('127.0.0.1');
    const fleet = new RobotFleet({ binary: '', emit: () => {}, resolveHost, pairRobot });

    cleanups.push(async () => fleet.dispose());

    const old = fleet.connectNetwork({ ...robot.endpoint, code: '123456' }, 'arm');

    expect(fleet.disconnect('arm')).toEqual({ ok: true });
    expect(fleet.units()).toEqual([]);
    expect(await fleet.connectNetwork({ ...robot.endpoint, code: '123456' }, 'arm')).toEqual({ ok: true });
    resolveOld('127.0.0.1');
    expect((await old).ok).toBe(false);
    expect(fleet.state('arm').connected).toBe(true);
  });

  it('keeps pending fleet connections within the fleet limit and forgets failed attempts', async () => {
    const { robot } = await setup();
    const fleet = new RobotFleet({
      binary: '',
      emit: () => {},
      pairRobot: ({ code }) => ({
        key: code === '123456' ? Promise.resolve(TEST_KEY) : Promise.reject(new Error('Pair again.')),
        cancel: () => {},
      }),
    });

    cleanups.push(async () => fleet.dispose());
    expect((await fleet.connectNetwork({ ...robot.endpoint, code: '999999' }, 'arm')).ok).toBe(false);
    expect(fleet.units()).toEqual([]);
    expect(await fleet.connectNetwork({ ...robot.endpoint, code: '123456' }, 'arm')).toEqual({ ok: true });
    expect(fleet.units()[0].unit).toBe('arm');
    expect((await fleet.connectNetwork(robot.endpoint, 'arm')).ok).toBe(false);
  });
});

describe('network robot boundary', () => {
  it('permits only local unicast destinations and pins DNS before connecting', async () => {
    const ip = (...octets) => octets.join('.');
    const local = [
      [127, 0, 0, 1],
      [192, 168, 1, 3],
      [10, 1, 0, 2],
      [172, 20, 0, 3],
      [169, 254, 1, 2],
    ];
    const external = [
      [8, 8, 8, 8],
      [0, 0, 0, 0],
      [224, 0, 0, 251],
      [100, 64, 0, 1],
    ];

    for (const address of [...local.map((octets) => ip(...octets)), '::1', ['fd00', '', '1'].join(':')])
      expect(isRobotAddress(address), address).toBe(true);

    for (const address of [...external.map((octets) => ip(...octets)), '::', ['ff02', '', '1'].join(':')])
      expect(isRobotAddress(address), address).toBe(false);

    const privateIp = ip(192, 168, 1, 8);
    const publicIp = ip(8, 8, 8, 8);
    const lookup = vi.fn().mockResolvedValue([{ address: privateIp }]);

    expect(await resolveRobotHost('robot.local', lookup)).toBe(privateIp);
    expect(lookup).toHaveBeenCalledOnce();
    await expect(
      resolveRobotHost('robot.local', async () => [{ address: ip(10, 0, 0, 1) }, { address: publicIp }]),
    ).rejects.toThrow('local');
    await expect(resolveRobotHost(publicIp, lookup)).rejects.toThrow('local');
    await expect(
      resolveRobotHost('robot.local', async () => {
        throw new Error('getaddrinfo ENOTFOUND robot.local');
      }),
    ).rejects.toThrow('Check the robot’s local address.');
  });

  it('rejects arbitrary URLs, injected hostnames, ports, keys and inherited request fields', () => {
    for (const ask of [
      null,
      { host: 'http://192.168.1.2' },
      { host: '127.0.0.1/path' },
      { host: 'robot\n.local' },
      { host: 'robot.local', key: TEST_KEY },
      { host: 'robot.local', port: -1 },
      { host: 'robot.local', code: 123456 },
      { host: 'robot.local', code: '123456\n' },
      Object.assign(Object.create({ code: '123456' }), { host: 'robot.local' }),
    ])
      expect(checkedEndpoint(ask), JSON.stringify(ask)).toBe(null);
  });
});
