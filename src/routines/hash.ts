const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);
const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function padded(bytes: Uint8Array): DataView {
  const length = Math.ceil((bytes.length + 9) / 64) * 64;
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);

  out.set(bytes);
  out[bytes.length] = 0x80;
  view.setUint32(length - 8, Math.floor((bytes.length * 8) / 2 ** 32));
  view.setUint32(length - 4, (bytes.length * 8) >>> 0);

  return view;
}

function schedule(view: DataView, offset: number, w: Uint32Array) {
  for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);

  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);

    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }
}

function compress(h: number[], w: Uint32Array) {
  const v = [...h];

  for (let i = 0; i < 64; i++) {
    const s1 = rotr(v[4], 6) ^ rotr(v[4], 11) ^ rotr(v[4], 25);
    const ch = (v[4] & v[5]) ^ (~v[4] & v[6]);
    const t1 = (v[7] + s1 + ch + K[i] + w[i]) >>> 0;
    const s0 = rotr(v[0], 2) ^ rotr(v[0], 13) ^ rotr(v[0], 22);
    const maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
    const t2 = (s0 + maj) >>> 0;

    v.splice(0, 8, (t1 + t2) >>> 0, v[0], v[1], v[2], (v[3] + t1) >>> 0, v[4], v[5], v[6]);
  }

  for (let i = 0; i < 8; i++) h[i] = (h[i] + v[i]) >>> 0;
}

export function sha256(text: string): string {
  const view = padded(new TextEncoder().encode(text));
  const h = [...INITIAL];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < view.byteLength; offset += 64) {
    schedule(view, offset, w);
    compress(h, w);
  }

  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : Number(a > b)));

    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}
