import { parentPort, workerData } from 'node:worker_threads';
import { runNativeBoard } from './validate.mjs';

const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 45_000);

parentPort.on('message', () => abort.abort());

try {
  parentPort.postMessage({
    result: await runNativeBoard(workerData.request, { signal: abort.signal, temporaryRoot: workerData.directory }),
  });
} catch (error) {
  parentPort.postMessage({ error: error.message });
} finally {
  clearTimeout(timer);
  parentPort.close();
}
