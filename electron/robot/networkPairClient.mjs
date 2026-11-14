import { spawn } from 'node:child_process';
import { isPairingKey } from './networkCredentials.mjs';

const PAIR_TIMEOUT_MS = 10000;
const PAIR_MESSAGE = 'Check the robot’s address and pairing code.';

export function pairNetworkRobot({ binary, address, port, code, spawnFn = spawn }) {
  const endpoint = address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`;
  const child = spawnFn(binary, ['--pair-client', endpoint], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let output = '';
  let ended = false;
  let cancel;
  const key = new Promise((resolve, reject) => {
    const finish = (message, value) => {
      if (ended) return;

      ended = true;
      clearTimeout(timer);

      if (message) {
        child.kill();
        reject(new Error(message));

        return;
      }

      resolve(value);
    };
    const timer = setTimeout(() => finish(PAIR_MESSAGE), PAIR_TIMEOUT_MS);

    cancel = () => finish('The robot connection was canceled.');
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (Buffer.byteLength(output) + Buffer.byteLength(chunk) > 4096) return finish(PAIR_MESSAGE);

      output += chunk;
    });
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => finish(PAIR_MESSAGE));
    child.on('error', () => finish('Download Basecase again from basecase.so to pair this robot.'));
    child.on('close', (exitCode) => {
      if (exitCode !== 0) return finish(PAIR_MESSAGE);

      try {
        const result = JSON.parse(output);

        if (result.event !== 'paired' || !isPairingKey(result.key)) return finish(PAIR_MESSAGE);

        finish(null, result.key);
      } catch {
        finish(PAIR_MESSAGE);
      }
    });
    child.stdin.end(`${JSON.stringify({ code })}\n`);
  });

  return { key, cancel: () => cancel() };
}
