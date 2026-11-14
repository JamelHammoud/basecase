import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { PIPE_CALLS } from './daemonPipe.mjs';
import { networkSocket } from './networkSocket.mjs';

const pipe = networkSocket({
  ...workerData,
  on: {
    line: (line) => parentPort.postMessage({ line }),
    key: (key) => parentPort.postMessage({ key }),
    ready: (hello) => parentPort.postMessage({ hello }),
    exit: (error) => parentPort.postMessage({ exit: true, error }),
  },
});

function transfer(files) {
  try {
    for (const { name, file } of files) {
      const bytes = fs.existsSync(file) ? fs.readFileSync(file) : null;
      const limit = name === 'policy.onnx' ? 16 * 1024 * 1024 : 64 * 1024;

      if (bytes?.length > limit) throw new Error('Choose a robot policy smaller than 16 MB.');

      pipe.write({ cmd: 'put_artefact', name, data: bytes?.toString('base64') ?? null });
    }
  } catch {
    pipe.kill();
  }
}

parentPort.on('message', ({ call, value }) => {
  if (call === 'transfer') return transfer(value);

  if (PIPE_CALLS.includes(call)) pipe[call](value);
});
