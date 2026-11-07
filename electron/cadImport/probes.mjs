import { encodeReply } from './reply.mjs';

const ATTEMPT_MS = 5000;
const CHUNK_BYTES = 256 * 1024 * 1024;

const hostProcess = () => globalThis.process;
const builtin = (name) => hostProcess().getBuiltinModule(name);
const importModule = (name) => import(/* @vite-ignore */ name);

async function attempt(report, name, run) {
  const timedOut = new Promise((resolve) => setTimeout(() => resolve('timed out'), ATTEMPT_MS));

  try {
    const got = await Promise.race([run(), timedOut]);

    report[name] = got === true ? 'ALLOWED' : `denied: ${String(got).slice(0, 60)}`;
  } catch (err) {
    report[name] = `denied: ${String(err?.message ?? err).slice(0, 60)}`;
  }
}

const answered = async (url, init) => {
  await fetch(url, init);

  return true;
};

const xhr = (url) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('GET', url);
    request.onload = () => resolve(request.responseText ?? '');
    request.onerror = () => reject(new Error('request failed'));
    request.send();
  });

const opened = (Kind, url) =>
  new Promise((resolve, reject) => {
    const channel = new Kind(url);

    channel.onopen = () => resolve(true);
    channel.onerror = () => reject(new Error('connection failed'));
  });

const nodeGet = (url) =>
  new Promise((resolve, reject) => {
    builtin('node:http')
      .get(url, (res) => resolve(res.statusCode > 0))
      .on('error', reject);
  });

const spawned = (childProcess, t) => childProcess.spawnSync(t.spawnCommand, t.spawnArgs).status === 0;

function readProbes(t) {
  const hasSecret = (text) => typeof text === 'string' && text.includes(t.secretMarker);

  return {
    'read home file: fetch file URL': async () => hasSecret(await (await fetch(t.secretUrl)).text()),
    'read home file: XMLHttpRequest': async () => hasSecret(await xhr(t.secretUrl)),
    'read home file: process.getBuiltinModule': () => hasSecret(builtin('node:fs').readFileSync(t.secretPath, 'utf8')),
    'read home file: import node:fs': async () =>
      hasSecret((await importModule('node:fs')).readFileSync(t.secretPath, 'utf8')),
    'read home file: import file URL': async () => hasSecret((await importModule(t.secretModuleUrl)).default),
    'read home file: kernel scheme traversal': async () => hasSecret(await (await fetch(t.traversalUrl)).text()),
  };
}

function writeProbes(t) {
  return {
    'write file: process.getBuiltinModule': () => {
      builtin('node:fs').writeFileSync(t.writePath, t.secretMarker);

      return true;
    },
    'write file: import node:fs/promises': async () => {
      await (await importModule('node:fs/promises')).writeFile(`${t.writePath}.2`, t.secretMarker);

      return true;
    },
  };
}

function networkProbes(t) {
  return {
    'fetch: local server': () => answered(`${t.localUrl}/fetch`),
    'fetch: local server, no-cors': () => answered(`${t.localUrl}/no-cors`, { mode: 'no-cors' }),
    'fetch: external': () => answered(t.externalUrl, { mode: 'no-cors' }),
    'fetch: app origin': async () => (await fetch(t.otherOriginUrl)).ok,
    'XMLHttpRequest: local server': async () => typeof (await xhr(`${t.localUrl}/xhr`)) === 'string',
    'WebSocket: local server': () => opened(WebSocket, t.wsUrl),
    'EventSource: local server': () => opened(EventSource, `${t.localUrl}/events`),
    sendBeacon: () => navigator.sendBeacon(`${t.localUrl}/beacon`, 'x') || 'refused',
    'import: http': async () => Boolean(await importModule(`${t.localUrl}/module.js`)),
    importScripts: () => {
      self.importScripts(`${t.localUrl}/script.js`);

      return true;
    },
    'node:http request': () => nodeGet(`${t.localUrl}/node-http`),
    'nested worker': () => Boolean(new Worker(`${t.localUrl}/worker.js`)),
  };
}

function processProbes(t) {
  const hasEnvMarker = (env) => Object.values(env ?? {}).includes(t.envMarker);

  return {
    'spawn: process.getBuiltinModule': () => spawned(builtin('node:child_process'), t),
    'spawn: import node:child_process': async () => spawned(await importModule('node:child_process'), t),
    'environment: process.env': () => hasEnvMarker(hostProcess().env),
    'environment: node:process': () => hasEnvMarker(builtin('node:process').env),
    'environment: import node:process': async () => hasEnvMarker((await importModule('node:process')).env),
  };
}

async function reach(targets) {
  const report = {};
  const probes = {
    ...readProbes(targets),
    ...writeProbes(targets),
    ...networkProbes(targets),
    ...processProbes(targets),
  };

  for (const [name, run] of Object.entries(probes)) await attempt(report, name, run);

  return encodeReply({ ok: true, probes: report });
}

function hang() {
  for (;;) Math.random();
}

function eatMemory() {
  const kept = [];

  for (;;) {
    kept.push(new Uint8Array(CHUNK_BYTES).fill(1));
    self.eatenBytes = kept.length * CHUNK_BYTES;
  }
}

const PROBES = { reach, hang, eatMemory };

export function runProbe({ kind, targets }) {
  if (!Object.hasOwn(PROBES, kind)) throw new Error(`No probe named ${kind}.`);

  return PROBES[kind](targets);
}
