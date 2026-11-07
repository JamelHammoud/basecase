export interface ProbeTargets {
  secretPath: string;
  secretUrl: string;
  secretMarker: string;
  moduleFileUrl: string;
  localUrl: string;
  wsUrl: string;
  externalUrl: string;
  externalWsUrl: string;
  otherOriginUrl: string;
  bridgeUrl: string;
}

const PROBE_BODY = `
const report = {};
const attempt = async (name, run) => {
  const timedOut = new Promise((resolve) => setTimeout(() => resolve('timed out'), 5000));

  try {
    const got = await Promise.race([run(), timedOut]);

    report[name] = got === true ? 'ALLOWED' : 'denied: ' + String(got).slice(0, 40);
  } catch (err) {
    report[name] = 'denied: ' + String(err?.message ?? err).slice(0, 40);
  }
};
const hasSecret = (text) => typeof text === 'string' && text.includes(targets.secretMarker);
const xhr = (url) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open('GET', url);
    request.onload = () => resolve(request.responseText ?? '');
    request.onerror = () => reject(new Error('request failed'));
    request.send();
  });
const socket = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url);

    ws.onopen = () => resolve(true);
    ws.onerror = () => reject(new Error('socket failed'));
  });
const eventSource = (url) =>
  new Promise((resolve, reject) => {
    const source = new EventSource(url);

    source.onopen = () => resolve(true);
    source.onerror = () => reject(new Error('source failed'));
  });
const answered = async (url, init) => {
  await fetch(url, init);

  return true;
};
const readWithNode = (fsApi) => hasSecret(fsApi.readFileSync(targets.secretPath, 'utf8'));

await attempt('read file: fetch', async () => hasSecret(await (await fetch(targets.secretUrl)).text()));
await attempt('read file: XMLHttpRequest', async () => hasSecret(await xhr(targets.secretUrl)));
await attempt('read file: process.getBuiltinModule', () => readWithNode(process.getBuiltinModule('node:fs')));
await attempt('read file: require', () => readWithNode(require('node:fs')));
await attempt('read file: import node:fs', async () => readWithNode(await import('node:fs')));
await attempt('read file: kernel scheme traversal', async () =>
  hasSecret(await (await fetch('basecase-kernel://kernel/..%2f..%2f..%2f..%2f..' + targets.secretPath)).text()),
);
await attempt('fetch: local server', () => answered(targets.localUrl + '/fetch'));
await attempt('fetch: local server, no-cors', () => answered(targets.localUrl + '/no-cors', { mode: 'no-cors' }));
await attempt('fetch: external', () => answered(targets.externalUrl, { mode: 'no-cors' }));
await attempt('XMLHttpRequest: local server', async () => {
  await xhr(targets.localUrl + '/xhr');

  return true;
});
await attempt('XMLHttpRequest: external', async () => {
  await xhr(targets.externalUrl);

  return true;
});
await attempt('sendBeacon', () => (navigator.sendBeacon(targets.localUrl + '/beacon', 'x') ? 'queued' : 'refused'));
await attempt('EventSource', () => eventSource(targets.localUrl + '/events'));
await attempt('WebSocket: local server', () => socket(targets.wsUrl));
await attempt('WebSocket: external', () => socket(targets.externalWsUrl));
await attempt('import: file', async () => {
  await import(targets.moduleFileUrl);

  return true;
});
await attempt('import: http', async () => {
  await import(targets.localUrl + '/module.js');

  return true;
});
await attempt('importScripts', () => {
  importScripts(targets.localUrl + '/script.js');

  return true;
});
await attempt('process', () => typeof process !== 'undefined' && Boolean(process.versions?.node));
await attempt('require', () => typeof require === 'function');
await attempt('serviceWorker', async () => {
  await navigator.serviceWorker.register('/worker.js');

  return true;
});
await attempt('open window', () => Boolean((globalThis.open ?? window.open)('about:blank')));
await attempt('nested worker', () => {
  new Worker(targets.localUrl + '/worker.js');

  return true;
});
await attempt('other origin: app', async () => (await fetch(targets.otherOriginUrl)).ok);
await attempt('other origin: agent bridge', async () => (await fetch(targets.bridgeUrl, { method: 'POST' })).ok);
`;

export const probeCode = (targets: ProbeTargets) =>
  `return (async () => {
const targets = ${JSON.stringify(targets)};
${PROBE_BODY}
throw new Error('PROBES:' + JSON.stringify(report));
})();`;

export const pageProbeSource = (targets: ProbeTargets) =>
  `(async () => {
const targets = ${JSON.stringify(targets)};
${PROBE_BODY}
await attempt('kernel page: only its four host calls', () => Object.keys(window.kernelHost).sort().join() !== 'failed,onJob,ready,result');
return report;
})()`;

export function parseProbes(message: unknown): Record<string, string> | null {
  const match = /PROBES:(\{.*\})/.exec(String(message));

  return match ? JSON.parse(match[1]) : null;
}

export const allowedProbes = (report: Record<string, string>) =>
  Object.entries(report)
    .filter(([, outcome]) => outcome === 'ALLOWED')
    .map(([name]) => name);
