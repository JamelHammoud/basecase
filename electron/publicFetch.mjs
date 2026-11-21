import dns from 'node:dns/promises';
import net from 'node:net';
import { fileSize } from './fileSize.mjs';

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
  [[192, 0, 2, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4],
  [[240, 0, 0, 0], 4],
];
const PRIVATE_V6 = [
  [[0], 96],
  [[0, 0, 0, 0, 0xffff, 0], 96],
  [[0x64, 0xff9b], 96],
  [[0x64, 0xff9b, 1], 48],
  [[0x100], 64],
  [[0x2001, 0xdb8], 32],
  [[0xfc00], 7],
  [[0xfe80], 10],
  [[0xfec0], 10],
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

function transitionV4(address) {
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [head, tail = ''] = canonical.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const words = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].map((word) =>
    Number.parseInt(word, 16),
  );
  const teredo = words[0] === 0x2001 && words[1] === 0;

  if (words[0] !== 0x2002 && !teredo) return null;

  const pair = teredo ? words.slice(6).map((word) => word ^ 0xffff) : words.slice(1, 3);

  return pair.flatMap((word) => [word >>> 8, word & 0xff]).join('.');
}

export function isPublicAddress(address) {
  if (net.isIPv4(address)) return !blocked.check(address, 'ipv4');

  if (!net.isIPv6(address) || address.includes('%') || blocked.check(address, 'ipv6')) return false;

  const embedded = transitionV4(address);

  return !embedded || !blocked.check(embedded, 'ipv4');
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

    if (!REDIRECT_CODES.has(res.status) || !location || init.redirect === 'manual') return res;

    await res.body?.cancel();

    if (init.redirect === 'error') throw new Error('Redirects aren’t allowed.');

    current = new URL(location, current).href;
  }

  throw new Error(`more than ${MAX_REDIRECTS} redirects`);
}

export async function readCapped(res, maxBytes, label = 'The response') {
  const declared = Number(res.headers.get('content-length') || 0);

  if (declared > maxBytes) throw new Error(`${label} is larger than ${fileSize(maxBytes)}`);

  const chunks = [];
  let size = 0;

  for await (const chunk of res.body ?? []) {
    size += chunk.byteLength;

    if (size > maxBytes) throw new Error(`${label} is larger than ${fileSize(maxBytes)}`);

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
