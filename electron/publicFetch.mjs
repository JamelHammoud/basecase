import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_REDIRECTS = 5;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

const PRIVATE_V4 = [
  [[0, 0, 0, 0], 8],
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10],
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[224, 0, 0, 0], 4],
  [[240, 0, 0, 0], 4],
];
const PRIVATE_V6 = [
  [[0], 128],
  [[0, 0, 0, 0, 0, 0, 0, 1], 128],
  [[0x64, 0xff9b], 96],
  [[0xfc00], 7],
  [[0xfe80], 10],
  [[0xff00], 8],
];
const v6 = (groups) =>
  [...groups, 0, 0, 0, 0, 0, 0, 0, 0]
    .slice(0, 8)
    .map((g) => g.toString(16))
    .join(':');

const blocked = new net.BlockList();

for (const [octets, prefix] of PRIVATE_V4) blocked.addSubnet(octets.join('.'), prefix, 'ipv4');

for (const [groups, prefix] of PRIVATE_V6) blocked.addSubnet(v6(groups), prefix, 'ipv6');

const mappedV4 = (address) => /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];

export function isPublicAddress(address) {
  const v4 = net.isIPv4(address) ? address : mappedV4(address);

  if (v4) return !blocked.check(v4, 'ipv4');

  return net.isIPv6(address) && !blocked.check(address, 'ipv6');
}

export async function assertPublicUrl(url) {
  const { protocol, hostname } = new URL(url);
  const host = hostname.replace(/^\[|\]$/g, '');

  if (!/^https?:$/.test(protocol)) throw new Error('only public http(s) addresses are allowed');

  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);

  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Error('only public http(s) addresses are allowed');
  }
}

export async function publicFetch(url, init = {}) {
  let current = String(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(current);

    const res = await fetch(current, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');

    if (!REDIRECT_CODES.has(res.status) || !location) return res;

    await res.body?.cancel();
    current = new URL(location, current).href;
  }

  throw new Error(`more than ${MAX_REDIRECTS} redirects`);
}

export async function readCapped(res, maxBytes, label = 'The response') {
  const declared = Number(res.headers.get('content-length') || 0);

  if (declared > maxBytes) throw new Error(`${label} is larger than ${Math.round(maxBytes / 1e6)} MB`);

  const chunks = [];
  let size = 0;

  for await (const chunk of res.body ?? []) {
    size += chunk.byteLength;

    if (size > maxBytes) throw new Error(`${label} is larger than ${Math.round(maxBytes / 1e6)} MB`);

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
