import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const LOCKED = 'Real motors are locked in this build';
const PORT = process.platform === 'win32' ? 'COM3' : '/dev/null';
const NETWORK = process.platform === 'win32' ? 'Ethernet' : 'en0';

const run = (binary, args, input) =>
  spawnSync(binary, args, { input, encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024 });

function helloOf(binary) {
  const r = run(binary, ['--family', 'feetech', '--ids', '1', '--emulated'], '');
  const first = (r.stdout ?? '').split('\n').find((l) => l.trim());

  try {
    return JSON.parse(first ?? '');
  } catch {
    return null;
  }
}

export function lockProblems(binary) {
  if (!fs.existsSync(binary)) return [`No daemon at ${binary}`];

  const problems = [];
  const port = run(binary, ['--family', 'feetech', '--ids', '1', '--port', PORT]);
  const said = `${port.stdout ?? ''}${port.stderr ?? ''}`;
  const network = run(binary, ['--family', 'unitree-g1', '--interface', NETWORK]);
  const answered = `${network.stdout ?? ''}${network.stderr ?? ''}`;
  const hello = helloOf(binary);
  const bytes = fs.readFileSync(binary);

  if (port.status === 0 || !said.includes(LOCKED)) problems.push(`Asked for a real port, it said: ${said.trim()}`);

  if (network.status === 0 || !answered.includes(LOCKED))
    problems.push(`Asked for a network interface, it said: ${answered.trim()}`);

  if (bytes.includes(Buffer.from('serialport'))) problems.push('The binary carries serialport');

  if (bytes.includes(Buffer.from('rustdds'))) problems.push('The binary carries rustdds');

  if (hello?.event !== 'hello') problems.push(`The first line wasn't a hello event: ${JSON.stringify(hello)}`);
  else if (hello.real_transport !== false) problems.push('The hello event says real transport is in this build');

  return problems;
}
