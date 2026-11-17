import { parentPort, workerData } from 'node:worker_threads';
import { routeToolStatus } from './routeTools.mjs';
import { routeNativeBoard } from './route.mjs';
import { runNativeBoard } from './validate.mjs';

const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 45_000);

parentPort.on('message', () => abort.abort());

const operations = { route: routeNativeBoard, tools: routeToolStatus, validate: runNativeBoard };
const execute = operations[workerData.mode ?? 'validate'];

try {
  parentPort.postMessage({
    result: await execute(workerData.request, { signal: abort.signal, temporaryRoot: workerData.directory }),
  });
} catch (error) {
  parentPort.postMessage({ error: error.message });
} finally {
  clearTimeout(timer);
  parentPort.close();
}
