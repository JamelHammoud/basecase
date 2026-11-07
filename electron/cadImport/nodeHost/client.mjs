import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { CONVERT_MESSAGES, CONVERT_MS, checkedConvertJob } from '../convertPolicy.mjs';
import { errorReply } from '../reply.mjs';

const require = createRequire(import.meta.url);
const THREAD = new URL('./thread.mjs', import.meta.url);
let occtModule = null;

const compiledOcct = () => {
  occtModule ??= WebAssembly.compile(fs.readFileSync(require.resolve('occt-import-js/dist/occt-import-js.wasm')));

  return occtModule;
};

function runInThread(job, timeoutMs) {
  return new Promise((resolve) => {
    const thread = new Worker(THREAD);
    const finish = (bytes) => {
      clearTimeout(timer);
      thread.terminate();
      resolve(bytes);
    };
    const timer = setTimeout(() => finish(errorReply(CONVERT_MESSAGES.timeout)), timeoutMs);

    thread.on('message', (message) => {
      if (message?.ready) thread.postMessage({ job: { ...job, id: 1 } });
      else if (message?.asset === 'occtWasm')
        compiledOcct().then((value) => thread.postMessage({ asset: 'occtWasm', value }));
      else if (message?.bytes instanceof Uint8Array) finish(message.bytes);
    });
    thread.on('error', (err) => finish(errorReply(err?.message ?? CONVERT_MESSAGES.stopped)));
    thread.on('exit', () => finish(errorReply(CONVERT_MESSAGES.stopped)));
  });
}

export function createNodeConverter() {
  return {
    convert: (job) => runInThread(checkedConvertJob(job), CONVERT_MS),
    probeConverter: (probe, timeoutMs) => runInThread({ convert: true, probe }, timeoutMs),
    stop: () => {},
  };
}
