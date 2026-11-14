import { Worker } from 'node:worker_threads';
import { PIPE_CALLS } from './daemonPipe.mjs';

const THREAD = new URL('./networkThread.mjs', import.meta.url);

export function networkPipe({ endpoint, address, key, on, saveKey }) {
  const worker = new Worker(THREAD, { workerData: { address, port: endpoint.port, key } });
  let exited = false;
  let started = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const exit = (error) => {
    if (exited) return;

    exited = true;
    void worker.terminate();

    if (!started) rejectReady(new Error(error ?? 'The robot disconnected.'));
    else on.exit(error);
  };

  worker.on('message', (message) => {
    if (exited) return;

    if (typeof message.key === 'string') {
      try {
        saveKey(message.key);
      } catch {
        exit('Couldn’t save the robot pairing.');
      }
    } else if (message.hello) {
      started = true;
      resolveReady(message.hello);
    } else if (typeof message.line === 'string') on.line(message.line);
    else if (message.exit) exit(message.error ?? null);
  });
  worker.on('error', (error) => exit(error.message));
  worker.on('exit', () => exit(null));

  const pipe = Object.fromEntries(
    [...PIPE_CALLS, 'transfer'].map((call) => [
      call,
      (value) => {
        if (!exited) worker.postMessage({ call, value });
      },
    ]),
  );

  return { pipe, ready };
}
