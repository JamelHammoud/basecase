import dgram from 'node:dgram';
import { discoverDnsSd } from './dnssd.mjs';
import { delay } from './shared.mjs';

export const BAMBU_MODELS = {
  C11: 'bambu-lab-p1p',
  C12: 'bambu-lab-p1s',
  C13: 'bambu-lab-x1e',
  'BL-P001': 'bambu-lab-x1-carbon',
  'BL-P002': 'bambu-lab-x1',
  N1: 'bambu-lab-a1-mini',
  N2S: 'bambu-lab-a1',
  O1D: 'bambu-lab-h2d',
};

const SSDP_GROUP = [239, 255, 255, 250].join('.');
const BROADCAST = [255, 255, 255, 255].join('.');
const BAMBU_URN = 'urn:bambulab-com:device:3dprinter:1';
const LISTEN_PORTS = [2021, 1990, 0];

export const M_SEARCH = [
  'M-SEARCH * HTTP/1.1',
  `HOST: ${SSDP_GROUP}:1990`,
  'MAN: "ssdp:discover"',
  'MX: 1',
  `ST: ${BAMBU_URN}`,
  '',
  '',
].join('\r\n');

export function parseSsdp(text) {
  const [startLine = '', ...lines] = String(text).split(/\r?\n/);
  const headers = {};

  for (const line of lines) {
    const colon = line.indexOf(':');

    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }

  return { startLine: startLine.trim(), headers };
}

function locationHost(location) {
  if (!location) return undefined;

  try {
    return location.includes('://') ? new URL(location).hostname : location;
  } catch {
    return undefined;
  }
}

export function bambuFromSsdp(text, address) {
  const { headers } = parseSsdp(text);
  const target = headers.nt ?? headers.st ?? '';
  const serial = headers.usn;

  if (!target.includes('bambulab') || !serial) return null;

  const model = headers['devmodel.bambu.com'];

  return {
    name: headers['devname.bambu.com'] || serial,
    host: locationHost(headers.location) || address,
    kind: 'bambu-lan',
    serial,
    modelId: BAMBU_MODELS[model] ?? null,
    cloud: headers['devconnect.bambu.com']?.toLowerCase() === 'cloud',
  };
}

function closeQuietly(socket) {
  try {
    socket.close();
  } catch {}
}

function joinGroup(socket) {
  try {
    socket.setBroadcast(true);
    socket.addMembership(SSDP_GROUP);
  } catch {}
}

function openSocket(port, onMessage) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket.on('message', onMessage);
    socket.on('error', () => {
      closeQuietly(socket);
      resolve(null);
    });
    socket.bind(port, () => {
      joinGroup(socket);
      resolve(socket);
    });
  });
}

function search(socket) {
  const message = Buffer.from(M_SEARCH);

  socket.send(message, 1990, SSDP_GROUP, () => {});
  socket.send(message, 2021, BROADCAST, () => {});
}

export async function discoverBambu({ timeoutMs }) {
  const found = new Map();
  const onMessage = (message, remote) => {
    const printer = bambuFromSsdp(message.toString('utf8'), remote.address);

    if (printer) found.set(printer.serial, printer);
  };
  const sockets = (await Promise.all(LISTEN_PORTS.map((port) => openSocket(port, onMessage)))).filter(Boolean);
  const sender = sockets.at(-1);

  if (sender) search(sender);

  await delay(timeoutMs);
  sockets.forEach(closeQuietly);

  return [...found.values()];
}

async function quietly(run) {
  try {
    return await run();
  } catch {
    return [];
  }
}

export async function discoverPrinters({ timeoutMs = 4000 } = {}) {
  const [bambu, services] = await Promise.all([
    quietly(() => discoverBambu({ timeoutMs })),
    quietly(() => discoverDnsSd({ timeoutMs })),
  ]);

  return [...bambu, ...services];
}
