import { parentPort, workerData } from 'node:worker_threads';
import { PIPE_CALLS, threadPipe } from './daemonPipe.mjs';

const pipe = threadPipe({
  binary: workerData.binary,
  args: workerData.args,
  on: {
    line: (line) => parentPort.postMessage({ line }),
    stderr: (stderr) => parentPort.postMessage({ stderr }),
    exit: (error) => parentPort.postMessage({ exit: true, error }),
  },
});

parentPort.on('message', ({ call, value }) => {
  if (PIPE_CALLS.includes(call)) pipe[call](value);
});
