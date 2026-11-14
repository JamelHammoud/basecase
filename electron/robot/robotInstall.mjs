import dns from 'node:dns/promises';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { findOnPath } from '../executables.mjs';
import { checkedRobotInstall, isRobotComputerAddress } from './robotInstallConfig.mjs';
import { downloadRobotDaemon } from './robotInstallDownload.mjs';
import { robotInstallScript } from './robotInstallScript.mjs';

function runSsh(args, input) {
  const ssh = findOnPath('ssh');

  if (!ssh) return Promise.reject(new Error('Install OpenSSH to connect to the robot computer.'));

  return new Promise((resolve, reject) => {
    const child = execFile(
      ssh,
      args,
      { timeout: 120_000, maxBuffer: 256 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) return reject(new Error(stderr.trim() || error.message));

        resolve(stdout);
      },
    );

    child.stdin.on('error', reject);
    child.stdin.end(input);
  });
}

async function addressOf(host, lookup) {
  const answers = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });

  if (!answers.length || !answers.every(({ address }) => isRobotComputerAddress(address)))
    throw new Error('Choose a robot computer on your private network.');

  return answers[0].address;
}

function sshArgs(config, address) {
  return [
    '-F',
    'none',
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'StrictHostKeyChecking=accept-new',
    '-o',
    'PermitLocalCommand=no',
    '-o',
    'ProxyCommand=none',
    '-o',
    'ProxyJump=none',
    '-o',
    `HostName=${address}`,
    '-o',
    `HostKeyAlias=${config.host}`,
    '-l',
    config.user,
    ...(config.key ? ['-i', config.key, '-o', 'IdentitiesOnly=yes'] : []),
    '--',
    config.host,
    'sh -s',
  ];
}

const ARCHES = new Map([
  ['Linux x86_64', 'x64'],
  ['Linux aarch64', 'arm64'],
  ['Linux arm64', 'arm64'],
]);

export async function installRobot(request, options = {}) {
  try {
    const config = checkedRobotInstall(request);
    const address = await addressOf(config.host, options.lookup ?? dns.lookup);
    const args = sshArgs(config, address);
    const run = options.run ?? runSsh;
    const machine = await run(args, 'set -eu\nuname -sm\n');
    const arch = ARCHES.get(machine.trim());

    if (!arch) throw new Error('Choose an x64 or arm64 Linux computer.');

    const binary = await (options.download ?? downloadRobotDaemon)(arch);
    const output = await run(args, robotInstallScript({ ...config, address, binary }));
    const code = /^BASECASE_PAIRING_CODE=(\d{6}|paired)$/m.exec(output)?.[1];

    if (!code) throw new Error('The robot service started without a pairing code. Check its user service log.');

    return {
      ok: true,
      host: config.host,
      address,
      port: config.port,
      pairingCode: code === 'paired' ? null : code,
      ...(code === 'paired' ? { paired: true } : {}),
    };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}
