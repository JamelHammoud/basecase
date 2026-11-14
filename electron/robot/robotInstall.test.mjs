import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installRobot } from './robotInstall.mjs';
import { G1_JOINT_NAMES, G1_WRITABLE_IDS } from './unitreeG1.mjs';

const jointMap = {
  robot: 'Home arm',
  class: 'arm',
  joints: [
    {
      id: 1,
      name: 'shoulder',
      family: 'feetech',
      type: 'revolute',
      zero_counts: 2048,
      direction: -1,
      min_rad: -1,
      max_rad: 1,
    },
  ],
};
const temporary = [];
const request = (extra = {}) => ({
  target: 'robot@robot.local',
  jointMap,
  emulated: true,
  pairingCode: '123456',
  ...extra,
});
const lan = [192, 168, 1, 42].join('.');
const publicAddress = [8, 8, 8, 8].join('.');
const lookup = async () => [{ address: lan, family: 4 }];

afterEach(() => {
  for (const dir of temporary.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function harness(arch = 'aarch64') {
  const calls = [];
  const run = vi.fn(async (args, input) => {
    calls.push({ args, input });

    if (input.includes('uname -sm')) return `Linux ${arch}\n`;

    return 'BASECASE_PAIRING_CODE=123456\n';
  });
  const binary = Buffer.from('linux daemon');
  const download = vi.fn(async () => binary);

  return { calls, run, download, binary, options: { lookup, run, download } };
}

function copiedFile(script, name) {
  const encoded = script
    .split('\n')
    .find((line) => line.endsWith(`"$stage/${name}"`))
    .split("'")[3];

  return Buffer.from(encoded, 'base64').toString();
}

describe('robot computer installation', () => {
  it('keeps IPv6 service binding when installation uses a private IPv6 address', async () => {
    const h = harness();
    const address = ['fd00', '', '42'].join(':');
    const result = await installRobot(request({ target: `robot@[${address}]` }), h.options);
    const unit = copiedFile(h.calls[1].input, 'basecase-robot.service');

    expect(result).toMatchObject({ ok: true, address });
    expect(unit).toContain('--listen-interface ${BASECASE_LISTEN_INTERFACE} --listen-port 7447 --listen-ipv6');
    expect(h.calls[0].args).toContain(`HostName=${address}`);
  });

  it('keeps G1 writable motor IDs and original names when package order differs', async () => {
    const h = harness();
    const map = {
      robot: 'G1',
      class: 'legged',
      joints: [...G1_JOINT_NAMES].reverse().map((name, index) => ({
        ...jointMap.joints[0],
        id: index + 1,
        family: null,
        joint: name,
        name: `j${index}`,
        zero_counts: 2000 + index,
      })),
    };
    const result = await installRobot(
      request({ jointMap: map, spec: { family: 'unitree-g1', emulated: true } }),
      h.options,
    );
    const calibration = JSON.parse(copiedFile(h.calls[1].input, 'calibration.json'));
    const unit = copiedFile(h.calls[1].input, 'basecase-robot.service');

    expect(result.ok).toBe(true);
    expect(calibration.joints.map(({ id }) => id)).toEqual(G1_WRITABLE_IDS);
    expect(calibration.joints[0]).toMatchObject({ id: 13, name: 'waist_yaw_joint', zero_counts: 2016 });
    expect(unit).toContain('--family unitree-g1 --emulated');
    expect(unit).not.toContain('--ids');
  });

  it('installs the checked ROS 2 controller and calibration in its joint order', async () => {
    const h = harness();
    const spec = {
      family: 'ros2',
      emulated: true,
      controller: { kind: 'forward_position', topic: '/forward_position_controller/commands' },
      joints: ['shoulder'],
    };
    const result = await installRobot(request({ spec }), h.options);
    const script = h.calls[1].input;

    expect(result.ok).toBe(true);
    expect(copiedFile(script, 'basecase-robot.service')).toContain(
      '--family ros2 --controller forward_position --topic /forward_position_controller/commands --joints shoulder --emulated',
    );
    expect(JSON.parse(copiedFile(script, 'calibration.json')).joints[0].name).toBe('shoulder');
  });

  it.each([
    ['aarch64', 'arm64'],
    ['x86_64', 'x64'],
  ])('copies the %s Linux build with package and calibration and starts the user service', async (machine, arch) => {
    const h = harness(machine);
    const result = await installRobot(request(), h.options);
    const script = h.calls[1].input;

    expect(result).toEqual({
      ok: true,
      host: 'robot.local',
      address: lan,
      port: 7447,
      pairingCode: '123456',
    });
    expect(h.download).toHaveBeenCalledWith(arch);
    expect(script).toContain(h.binary.toString('base64'));
    expect(script).toContain(Buffer.from(JSON.stringify(jointMap)).toString('base64'));
    expect(script).toContain(
      Buffer.from(
        JSON.stringify({
          class: 'arm',
          joints: [{ id: 1, name: 'shoulder', zero_counts: 2048, direction: -1, min_rad: -1, max_rad: 1 }],
        }),
      ).toString('base64'),
    );
    expect(script).toContain('systemctl --user enable --now basecase-robot.service');
    expect(script).toContain('loginctl enable-linger');

    const encoded = script
      .split('\n')
      .find((line) => line.includes('/basecase-robot.service'))
      .split("'")[3];
    const unit = Buffer.from(encoded, 'base64').toString();

    expect(unit).toContain('--emulated');
    expect(unit).toContain('--listen-interface ${BASECASE_LISTEN_INTERFACE} --listen-port 7447');
    expect(unit).toContain('EnvironmentFile="%h/.local/share/basecase-robot/network.env"');
    expect(unit).not.toContain('--listen-ipv6');
    expect(unit).not.toContain('--port');
    expect(h.calls[0].args).toContain('HostName=192.168.1.42');
    expect(h.calls[0].args).toContain('HostKeyAlias=robot.local');
    expect(h.calls[0].args).toContain('StrictHostKeyChecking=accept-new');
  });
});

describe('robot computer installation validation', () => {
  it.each([
    { zero_counts: 0, direction: 1, min_rad: -1, max_rad: 1 },
    { zero_counts: 4095, direction: 1, min_rad: -1, max_rad: 1 },
    { zero_counts: 0, direction: -1, min_rad: -1, max_rad: 1 },
    { zero_counts: 4095, direction: -1, min_rad: -1, max_rad: 1 },
    { zero_counts: 0, direction: 1, min_rad: -Math.PI / 4096, max_rad: 1 },
  ])('refuses rotary limits outside the encoder turn before SSH: %j', async (limits) => {
    const h = harness();
    const map = { ...jointMap, joints: [{ ...jointMap.joints[0], ...limits }] };
    const result = await installRobot(request({ jointMap: map }), h.options);

    expect(result.ok).toBe(false);
    expect(h.run).not.toHaveBeenCalled();
  });

  it.each([
    { zero_counts: 0, direction: 1, min_rad: -0.0007, max_rad: 1 },
    { zero_counts: 4095, direction: -1, min_rad: 0, max_rad: 1 },
  ])('accepts rotary limits whose rounded encoder counts stay in the turn: %j', async (limits) => {
    const h = harness();
    const map = { ...jointMap, joints: [{ ...jointMap.joints[0], ...limits }] };

    expect((await installRobot(request({ jointMap: map }), h.options)).ok).toBe(true);
    expect(h.run).toHaveBeenCalledTimes(2);
  });

  it('refuses public, loopback, metadata, mixed DNS answers and empty DNS before SSH', async () => {
    for (const addresses of [
      [publicAddress],
      ['127.0.0.1'],
      [[169, 254, 169, 254].join('.')],
      [lan, publicAddress],
      [],
    ]) {
      const h = harness();
      const result = await installRobot(request(), {
        ...h.options,
        lookup: async () => addresses.map((address) => ({ address })),
      });

      expect(result.ok).toBe(false);
      expect(h.run).not.toHaveBeenCalled();
    }
  });

  it('names a missing SSH key before opening a connection', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robot-install-'));
    const h = harness();

    temporary.push(dir);

    expect(await installRobot(request({ key: path.join(dir, 'missing-key') }), h.options)).toEqual({
      ok: false,
      message: 'Choose an SSH private key file.',
    });
    expect(h.run).not.toHaveBeenCalled();
  });

  it('refuses host, user, key, code and deployment injection before SSH', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robot-install-'));

    temporary.push(dir);

    const attacks = [
      { target: '-oProxyCommand=touch /tmp/pwned' },
      { target: 'robot@robot.local;id' },
      { target: 'robot\nProxyCommand=id@robot.local' },
      { key: '-oProxyCommand=id' },
      { key: dir },
      { pairingCode: '123456\nExecStart=id' },
      { pairingCode: 123456 },
      { emulated: false },
      { jointMap: { ...jointMap, class: 'arm\nExecStart=id' } },
      { jointMap: { ...jointMap, joints: [{ ...jointMap.joints[0], id: '1;id' }] } },
      { jointMap: { ...jointMap, joints: [{ ...jointMap.joints[0], min_rad: 0, max_rad: 1e-100 }] } },
      { jointMap: { ...jointMap, joints: [{ ...jointMap.joints[0], min_rad: -1e100, max_rad: 1e100 }] } },
      { port: '7447;id' },
      { shell: true },
    ];

    for (const attack of attacks) {
      const h = harness();
      const result = await installRobot(request(attack), h.options);

      expect(result.ok).toBe(false);
      expect(h.run).not.toHaveBeenCalled();
    }
  });

  it('fails before copying on unsupported computers and preserves SSH errors', async () => {
    const unsupported = harness('armv7l');

    expect((await installRobot(request(), unsupported.options)).ok).toBe(false);
    expect(unsupported.download).not.toHaveBeenCalled();

    const denied = harness();

    denied.run.mockRejectedValue(new Error('Permission denied (publickey).'));
    expect(await installRobot(request(), denied.options)).toEqual({
      ok: false,
      message: 'Permission denied (publickey).',
    });
  });
});
