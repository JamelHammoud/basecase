import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const LOCKED = 'Real motors are locked in this build';
const PORT = process.platform === 'win32' ? 'COM3' : '/dev/null';
const NETWORK = process.platform === 'win32' ? 'Ethernet' : 'en0';
const ROS2_ARGS = ['--family', 'ros2', '--controller', 'forward_position', '--joints', 'shoulder_pan_joint'];

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

const LOCKED_ASKS = [
  { what: 'a real port', args: ['--family', 'feetech', '--ids', '1', '--port', PORT] },
  { what: 'a network interface', args: ['--family', 'unitree-g1', '--interface', NETWORK] },
  { what: 'a ROS 2 robot on a network interface', args: [...ROS2_ARGS, '--interface', NETWORK] },
];

function unlockedAsk(binary, { what, args }) {
  const r = run(binary, args);
  const said = `${r.stdout ?? ''}${r.stderr ?? ''}`;

  return r.status === 0 || !said.includes(LOCKED) ? [`Asked for ${what}, it said: ${said.trim()}`] : [];
}

function helloProblems(hello) {
  if (hello?.event !== 'hello') return [`The first line wasn't a hello event: ${JSON.stringify(hello)}`];

  return hello.real_transport === false ? [] : ['The hello event says real transport is in this build'];
}

export function lockProblems(binary) {
  if (!fs.existsSync(binary)) return [`No daemon at ${binary}`];

  const bytes = fs.readFileSync(binary);
  const carried = ['serialport', 'rustdds'].filter((name) => bytes.includes(Buffer.from(name)));

  return [
    ...LOCKED_ASKS.flatMap((ask) => unlockedAsk(binary, ask)),
    ...carried.map((name) => `The binary carries ${name}`),
    ...helloProblems(helloOf(binary)),
  ];
}
