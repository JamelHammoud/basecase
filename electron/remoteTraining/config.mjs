import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { findOnPath } from '../executables.mjs';

const HOST = /^(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)$/i;
const USER = /^[a-z_][a-z0-9_-]{0,31}$/i;
const KEY = /^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) ([A-Za-z0-9+/]{24,2048}={0,2})(?: [^\r\n]{0,256})?$/;

function checkedIdentity(key) {
  if (typeof key !== 'string' || !path.isAbsolute(key) || /[\0\r\n]/.test(key))
    throw new Error('Choose an existing SSH identity file.');

  const stat = fs.statSync(key, { throwIfNoEntry: false });

  if (!stat?.isFile() || stat.size > 1024 * 1024) throw new Error('Choose an existing SSH identity file.');
}

export function checkedComputer(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).some((key) => !['host', 'user', 'key', 'hostKey'].includes(key))
  )
    throw new Error('Enter the training computer’s host, user, SSH identity and host key.');

  const { host, user, key, hostKey } = value;

  if (typeof host !== 'string' || !HOST.test(host) || host.includes('..'))
    throw new Error('Enter the training computer’s host name.');

  if (typeof user !== 'string' || !USER.test(user)) throw new Error('Enter the SSH user.');

  checkedIdentity(key);

  if (typeof hostKey !== 'string' || !KEY.test(hostKey))
    throw new Error('Enter the host public key verified on the training computer.');

  const matched = KEY.exec(hostKey);

  return { host, user, key, hostKey: `${matched[1]} ${matched[2]}` };
}

export function sshArguments(config, knownHosts) {
  const knownHostsValue = knownHosts.replaceAll('\\', '/').replaceAll('"', '\\"');

  return [
    '-F',
    'none',
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    `UserKnownHostsFile="${knownHostsValue}"`,
    '-o',
    'GlobalKnownHostsFile=none',
    '-o',
    'UpdateHostKeys=no',
    '-o',
    'PermitLocalCommand=no',
    '-o',
    'ProxyCommand=none',
    '-o',
    'ProxyJump=none',
    '-o',
    'ClearAllForwardings=yes',
    '-o',
    'ForwardAgent=no',
    '-o',
    'IdentitiesOnly=yes',
    '-i',
    config.key,
    '-l',
    config.user,
    '--',
    config.host,
    'sh -s',
  ];
}

function sshError(error, stderr) {
  const message = stderr.trim().slice(-2000) || error.message;
  const failure = new Error(message);
  const network =
    /Connection timed out|Connection reset|Connection closed|Broken pipe|No route to host|Network is unreachable|Could not resolve hostname|Connection refused/i;

  failure.reconnect =
    network.test(message) || (error.killed === true && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');

  return failure;
}

export function runSsh({ args, input, maxBytes = 2 * 1024 * 1024 }) {
  const ssh = findOnPath('ssh');

  if (!ssh) return Promise.reject(new Error('Install OpenSSH to connect to the training computer.'));

  return new Promise((resolve, reject) => {
    const child = execFile(
      ssh,
      args,
      { timeout: 30_000, maxBuffer: maxBytes, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) return reject(sshError(error, stderr));

        resolve(stdout);
      },
    );

    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') reject(error);
    });
    child.stdin.end(input);
  });
}
