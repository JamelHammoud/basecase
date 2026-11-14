import replicadWasmUrl from 'replicad-opencascadejs/wasm?url';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url';

const LIBRARY_URL = '/library.json';
const WORKER_URL = '/worker.js';
const CONVERT_URL = '/convert.js';
const host = window.kernelHost;
const loaded = new Map();

const fetchOk = async (url) => {
  const response = await fetch(url);

  if (!response.ok) throw new Error(`${url} answered ${response.status}`);

  return response;
};

const ASSETS = {
  library: async () => (await fetchOk(LIBRARY_URL)).json(),
  replicadWasm: () => WebAssembly.compileStreaming(fetchOk(replicadWasmUrl)),
  manifoldWasm: () => WebAssembly.compileStreaming(fetchOk(manifoldWasmUrl)),
  occtWasm: () => WebAssembly.compileStreaming(fetchOk(occtWasmUrl)),
};

function asset(name) {
  if (!loaded.has(name)) loaded.set(name, ASSETS[name]());

  return loaded.get(name);
}

let worker = null;
let runningId = null;
let runningLanguage = null;

function sendAsset(from, name) {
  if (!Object.hasOwn(ASSETS, name)) return;

  asset(name).then(
    (value) => from.postMessage({ asset: name, value }),
    (err) => host.failed(`Couldn’t load ${name}: ${err?.message ?? err}`),
  );
}

function finishJob(bytes) {
  const id = runningId;
  const untrusted = runningLanguage === 'replicad';

  runningId = null;
  runningLanguage = null;
  host.result(id, bytes);

  if (untrusted) startWorker('replicad');
}

function onWorkerMessage(message) {
  if (typeof message !== 'object' || message === null) return;

  if (message.ready === true) host.ready();
  else if (typeof message.asset === 'string') sendAsset(worker, message.asset);
  else if (message.bytes instanceof Uint8Array && runningId !== null && message.id === runningId)
    finishJob(message.bytes);
}

function startWorker(prewarm) {
  worker?.terminate();

  const started = new Worker(WORKER_URL, { type: 'module' });
  const isCurrent = () => started === worker;

  worker = started;
  started.addEventListener('message', (event) => {
    if (isCurrent()) onWorkerMessage(event.data);
  });
  started.addEventListener('error', (event) => {
    if (isCurrent()) host.failed(event.message || 'The kernel worker failed to load.');
  });
  started.addEventListener('messageerror', () => {
    if (isCurrent()) host.failed('The kernel worker sent an unreadable message.');
  });
  started.postMessage({ prewarm });
}

const failureBytes = (error) =>
  new TextEncoder().encode(JSON.stringify({ ok: false, error: `The converter failed: ${error}` }));

function onConvertMessage({ converter, job, finish }, message) {
  if (typeof message !== 'object' || message === null) return;

  if (message.ready === true) converter.postMessage({ job }, job.bytes ? [job.bytes.buffer] : []);
  else if (typeof message.asset === 'string') sendAsset(converter, message.asset);
  else if (message.bytes instanceof Uint8Array && message.id === job.id) finish(message.bytes);
}

function runConvert(job) {
  const converter = new Worker(CONVERT_URL, { type: 'module' });
  let done = false;
  const finish = (bytes) => {
    if (done) return;

    done = true;
    converter.terminate();
    host.result(job.id, bytes);
  };

  converter.addEventListener('message', (event) => onConvertMessage({ converter, job, finish }, event.data));
  converter.addEventListener('error', (event) => finish(failureBytes(event.message || 'it didn’t load')));
  converter.addEventListener('messageerror', () => finish(failureBytes('it sent an unreadable message')));
}

host.onJob((job) => {
  if (job.convert) {
    runConvert(job);

    return;
  }

  runningId = job.id;
  runningLanguage = job.language ?? null;
  worker.postMessage({ job });
});
startWorker('openscad');
