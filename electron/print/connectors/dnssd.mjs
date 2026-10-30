import { spawn } from 'node:child_process';
import { delay } from './shared.mjs';

const SERVICES = [
  ['_octoprint._tcp', 'octoprint'],
  ['_moonraker._tcp', 'moonraker'],
];

export function parseBrowseLine(line) {
  const match = /^\S+\s+Add\s+\S+\s+\S+\s+(\S+)\s+(\S+)\s+(.+?)\s*$/.exec(line);

  return match ? { domain: match[1], type: match[2], name: match[3] } : null;
}

export function parseResolveLine(line) {
  const match = /can be reached at (\S+?)\.?:(\d+)/.exec(line);

  return match ? { host: match[1], port: Number(match[2]) } : null;
}

export function hostWithPort({ host, port }) {
  return port === 80 ? host : `${host}:${port}`;
}

function readLines(stream, onLine) {
  let partial = '';

  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (partial + chunk).split(/\r?\n/);

    partial = lines.pop();
    lines.forEach(onLine);
  });
}

function runDnsSd(args, onLine, children) {
  try {
    const child = spawn('script', ['-q', '/dev/null', 'dns-sd', ...args], { stdio: ['ignore', 'pipe', 'ignore'] });

    child.on('error', () => {});
    readLines(child.stdout, onLine);
    children.push(child);
  } catch {}
}

function browse({ type, kind, found, children }) {
  const resolving = new Set();

  runDnsSd(
    ['-B', type, 'local.'],
    (line) => {
      const entry = parseBrowseLine(line);

      if (!entry || resolving.has(entry.name)) return;

      resolving.add(entry.name);
      runDnsSd(
        ['-L', entry.name, type, 'local.'],
        (resolved) => {
          const address = parseResolveLine(resolved);

          if (address)
            found.set(`${kind}:${hostWithPort(address)}`, { name: entry.name, host: hostWithPort(address), kind });
        },
        children,
      );
    },
    children,
  );
}

export async function discoverDnsSd({ timeoutMs, platform = process.platform }) {
  if (platform !== 'darwin') return [];

  const children = [];
  const found = new Map();

  for (const [type, kind] of SERVICES) browse({ type, kind, found, children });

  await delay(timeoutMs);

  for (const child of children) child.kill();

  return [...found.values()];
}
