import { readFileSync } from 'node:fs';
import { resolveObjectURL } from 'node:buffer';
import vm from 'node:vm';

const IDBFS_MOUNT = 'this.Vosk.FS.mount(this.Vosk.IDBFS';
const MEMFS_MOUNT = 'this.Vosk.FS.mount(this.Vosk.FS.filesystems.MEMFS';

const quietConsole = { ...console, log: () => {}, info: () => {}, debug: () => {}, warn: () => {} };

function modelResponse(bytes, context) {
  const LocalBytes = vm.runInContext('Uint8Array', context);
  let sent = false;
  const read = async () => {
    if (sent) return { done: true, value: undefined };

    sent = true;

    return { done: false, value: LocalBytes.from(bytes) };
  };

  return { ok: true, status: 200, headers: { get: () => String(bytes.length) }, body: { getReader: () => ({ read }) } };
}

function workerScope(outer, modelBytes) {
  const scope = new EventTarget();
  const location = { href: 'http://localhost/vosk-worker.js' };
  const context = vm.createContext({
    self: scope,
    location,
    console: quietConsole,
    setTimeout,
    clearTimeout,
    WebAssembly,
    TextDecoder,
    TextEncoder,
    URL,
    atob,
    performance,
    crypto,
    close: () => outer.terminate(),
    postMessage: (data) => outer.deliver(data),
    fetch: (url) => (String(url).startsWith('data:') ? fetch(url) : modelResponse(modelBytes, context)),
  });

  Object.assign(scope, { location, postMessage: context.postMessage });

  return { scope, context };
}

export function readWav(path) {
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 0;

  for (let at = 12; at + 8 <= bytes.length; at += 8 + view.getUint32(at + 4, true)) {
    const id = bytes.toString('ascii', at, at + 4);

    if (id === 'fmt ') sampleRate = view.getUint32(at + 12, true);

    if (id === 'data') {
      const count = view.getUint32(at + 4, true) / 2;
      const samples = Float32Array.from({ length: count }, (_, i) => view.getInt16(at + 8 + i * 2, true) / 0x8000);

      return { samples, sampleRate };
    }
  }

  throw new Error(`${path} has no data`);
}

export function installVoskWorker(modelPath) {
  const modelBytes = readFileSync(modelPath);
  const workers = [];

  class NodeVoskWorker extends EventTarget {
    constructor(url) {
      super();
      this.terminated = false;
      this.booted = resolveObjectURL(url)
        .text()
        .then((source) => this.boot(source));
      workers.push(this);
    }

    boot(source) {
      const { scope, context } = workerScope(this, modelBytes);

      vm.runInContext(source.replace(IDBFS_MOUNT, MEMFS_MOUNT), context);
      this.scope = scope;
    }

    deliver(data) {
      if (!this.terminated) setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data })), 0);
    }

    postMessage(data) {
      this.booted.then(() => {
        if (!this.terminated) setTimeout(() => this.scope.dispatchEvent(new MessageEvent('message', { data })), 0);
      });
    }

    terminate() {
      this.terminated = true;
    }
  }

  const previous = globalThis.Worker;

  globalThis.Worker = NodeVoskWorker;

  return {
    workers,
    uninstall: () => {
      globalThis.Worker = previous;
    },
  };
}
