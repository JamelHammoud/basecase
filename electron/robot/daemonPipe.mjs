import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { Worker } from 'node:worker_threads';
import { IntentPacer } from './intentPacer.mjs';

const spawnDaemon = (binary, args) => spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

export function threadPipe({ binary, args, on, spawnFn = spawnDaemon }) {
  const child = spawnFn(binary, args);
  const write = (command) => {
    if (child.stdin.writable) child.stdin.write(`${JSON.stringify(command)}\n`);
  };
  const pacer = new IntentPacer({ write });
  const exit = (error) => {
    pacer.stop();
    on.exit(error);
  };

  child.stdin.on('error', () => {});
  readline.createInterface({ input: child.stdout }).on('line', on.line);
  child.stderr.on('data', (chunk) => on.stderr(String(chunk)));
  child.on('error', (err) => exit(err.message));
  child.on('exit', () => exit(null));

  return {
    write,
    drive: (joints) => pacer.drive(joints),
    hold: (joints) => pacer.hold(joints),
    idle: () => pacer.idle(),
    alive: () => pacer.alive(),
    end: () => {
      pacer.stop();
      child.stdin.end();
    },
    kill: () => child.kill(),
  };
}

export const PIPE_CALLS = ['write', 'drive', 'hold', 'idle', 'alive', 'end', 'kill'];

const THREAD = new URL('./daemonThread.mjs', import.meta.url);

export function workerPipe({ binary, args, on }) {
  const worker = new Worker(THREAD, { workerData: { binary, args } });
  let exited = false;
  const exit = (error) => {
    if (exited) return;

    exited = true;
    void worker.terminate();
    on.exit(error);
  };

  worker.on('message', (message) => {
    if (typeof message.line === 'string') on.line(message.line);
    else if (typeof message.stderr === 'string') on.stderr(message.stderr);
    else if (message.exit) exit(message.error ?? null);
  });
  worker.on('error', (err) => exit(err.message));
  worker.on('exit', () => exit(null));

  return Object.fromEntries(
    PIPE_CALLS.map((call) => [
      call,
      (value) => {
        if (!exited) worker.postMessage({ call, value });
      },
    ]),
  );
}
