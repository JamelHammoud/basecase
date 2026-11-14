import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installRobot } from './robotInstall.mjs';

const homes = [];
const lan = [192, 168, 1, 42].join('.');
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
      direction: 1,
      min_rad: -1,
      max_rad: 1,
    },
  ],
};

afterEach(() => {
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

function executable(dir, name, text) {
  const file = path.join(dir, name);

  fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${text}\n`, { mode: 0o700 });

  return file;
}

function sshComputer({ linger = true, interfaceName = 'eth0' } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-ssh-'));
  const bin = path.join(home, 'bin');

  homes.push(home);
  fs.mkdirSync(bin);
  executable(bin, 'uname', 'echo Linux x86_64');
  executable(bin, 'loginctl', linger ? 'printf "%s\\n" "$*" >> "$HOME/commands"' : 'exit 1');
  executable(bin, 'journalctl', 'printf \'{"event":"listening"}\\n\'');
  executable(
    bin,
    'systemctl',
    [
      'printf "%s\\n" "$*" >> "$HOME/commands"',
      'case "$*" in',
      '"--user cat basecase-robot.service") exit 1 ;;',
      '"--user show basecase-robot.service --property=InvocationID --value") echo 0123456789abcdef0123456789abcdef ;;',
      '"--user enable --now basecase-robot.service") if [ ! -e "$HOME/.local/share/basecase-robot/pairing.json" ]; then code=$(cat "$HOME/.local/share/basecase-robot/pairing-code.seed"); printf \'{"key":"never-print-this-key","code":"%s"}\' "$code" > "$HOME/.local/share/basecase-robot/pairing.json"; fi; rm "$HOME/.local/share/basecase-robot/pairing-code.seed" ;;',
      'esac',
    ].join('\n'),
  );

  const ssh = executable(bin, 'ssh', 'printf "%s\\n" "$@" >> "$HOME/ssh-argv"\nexec /bin/sh -s');
  const run = (args, input) =>
    new Promise((resolve, reject) => {
      const child = execFile(
        ssh,
        args,
        { env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}` } },
        (error, stdout, stderr) => {
          if (error) return reject(new Error(stderr.trim() || error.message));

          resolve(stdout);
        },
      );

      child.stdin.end(input);
    });
  const encodedInterface = Buffer.from(interfaceName).toString('base64');
  const binary = Buffer.from(
    `#!/bin/sh\nif [ "$1" = --interface-for ]; then printf '%s' '${encodedInterface}' | base64 -d; exit 0; fi\necho "Real motors are locked in this build" >&2\nexit 2\n`,
  );

  return { home, binary, options: { run, download: async () => binary, lookup: async () => [{ address: lan }] } };
}

describe.skipIf(process.platform === 'win32')('SSH installation with a temporary Linux computer shim', () => {
  it('keeps the existing key when reinstalling a paired robot', async () => {
    const computer = sshComputer();
    const root = path.join(computer.home, '.local', 'share', 'basecase-robot');
    const pairing = JSON.stringify({ key: 'keep-this-key', code: null });

    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'pairing.json'), pairing);

    const result = await installRobot(
      { target: 'robot@robot.local', jointMap, emulated: true, pairingCode: '123456' },
      computer.options,
    );

    expect(result).toMatchObject({ ok: true, pairingCode: null, paired: true });
    expect(fs.readFileSync(path.join(root, 'pairing.json'), 'utf8')).toBe(pairing);
    expect(fs.existsSync(path.join(root, 'pairing-code.seed'))).toBe(false);
  });

  it('executes the entire remote install script and returns the persisted code without the key', async () => {
    const computer = sshComputer();
    const result = await installRobot(
      { target: 'robot@robot.local', jointMap, emulated: true, pairingCode: '123456' },
      computer.options,
    );
    const root = path.join(computer.home, '.local', 'share', 'basecase-robot');
    const unit = fs.readFileSync(
      path.join(computer.home, '.config', 'systemd', 'user', 'basecase-robot.service'),
      'utf8',
    );

    expect(result).toMatchObject({ ok: true, pairingCode: '123456' });
    expect(JSON.stringify(result)).not.toContain('never-print-this-key');
    expect(fs.readFileSync(path.join(root, 'robot-daemon'))).toEqual(computer.binary);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'joint_map.json'), 'utf8'))).toEqual(jointMap);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'calibration.json'), 'utf8')).joints[0]).toEqual({
      id: 1,
      name: 'shoulder',
      zero_counts: 2048,
      direction: 1,
      min_rad: -1,
      max_rad: 1,
    });
    expect(fs.statSync(path.join(root, 'robot-daemon')).mode & 0o777).toBe(0o700);
    expect(unit).toContain('--name "Home arm"');
    expect(unit).toContain('--emulated');
    expect(unit).toContain('--pairing-code-file %h/.local/share/basecase-robot/pairing-code.seed');
    expect(unit).not.toContain('123456');
    expect(fs.existsSync(path.join(root, 'pairing-code.seed'))).toBe(false);
    expect(unit).toContain('--listen-interface ${BASECASE_LISTEN_INTERFACE} --listen-port 7447');
    expect(fs.readFileSync(path.join(root, 'network.env'), 'utf8')).toBe('BASECASE_LISTEN_INTERFACE=eth0\n');
    expect(fs.readFileSync(path.join(computer.home, 'commands'), 'utf8')).toContain(
      '--user enable --now basecase-robot.service',
    );
    expect(fs.readFileSync(path.join(computer.home, 'ssh-argv'), 'utf8')).toContain(`HostName=${lan}`);
  });

  it('fails before copying when the SSH user lacks permission to keep the service alive', async () => {
    const computer = sshComputer({ linger: false });
    const result = await installRobot({ target: 'robot@robot.local', jointMap, emulated: true }, computer.options);

    expect(result).toEqual({
      ok: false,
      message: 'Enable lingering for this SSH user with loginctl enable-linger.',
    });
    expect(fs.existsSync(path.join(computer.home, '.local', 'share', 'basecase-robot', 'robot-daemon'))).toBe(false);
  });

  it('refuses an interface name that would inject systemd environment settings before replacement', async () => {
    const computer = sshComputer({ interfaceName: 'eth0\nLD_PRELOAD=evil.so' });
    const result = await installRobot({ target: 'robot@robot.local', jointMap, emulated: true }, computer.options);

    expect(result).toEqual({ ok: false, message: 'The robot computer’s network interface name is unsupported.' });
    expect(fs.existsSync(path.join(computer.home, '.local', 'share', 'basecase-robot', 'robot-daemon'))).toBe(false);
  });
});
