import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { NO_KEY, PrintServices, serviceOrigin } from './index.mjs';
import { KEY_REFUSED } from './slant3dClient.mjs';
import { FAKE_FILAMENTS, fakeUnitUsd, startFakeSlant } from './testService.mjs';

const KEY = 'sl-test-key';
const FACES = [
  [0, 2, 1, 0, 3, 2],
  [4, 5, 6, 4, 6, 7],
  [0, 1, 5, 0, 5, 4],
  [2, 3, 7, 2, 7, 6],
  [1, 2, 6, 1, 6, 5],
  [0, 4, 7, 0, 7, 3],
];

function boxStl([x, y, z]) {
  const corners = [
    [0, 0, 0],
    [x, 0, 0],
    [x, y, 0],
    [0, y, 0],
    [0, 0, z],
    [x, 0, z],
    [x, y, z],
    [0, y, z],
  ];
  const indices = FACES.flat();
  const bytes = Buffer.alloc(84 + (indices.length / 3) * 50);

  bytes.writeUInt32LE(indices.length / 3, 80);
  indices.forEach((corner, i) => {
    const at = 84 + Math.floor(i / 3) * 50 + 12 + (i % 3) * 12;

    corners[corner].forEach((v, k) => bytes.writeFloatLE(v, at + k * 4));
  });

  return new Uint8Array(bytes);
}

const shape = (part, size, extra = {}) => ({
  part,
  name: part,
  material: 'PLA',
  copies: 1,
  stl: boxStl(size),
  ...extra,
});

let fake;
let dir;
let override;

const services = () =>
  new PrintServices({ libraryDir: dir, secrets: null, origin: () => fake.origin, outbound: globalThis.fetch });

async function keyed() {
  const s = services();

  await s.setKey(KEY);

  return s;
}

const filament = (profile) => FAKE_FILAMENTS.find((f) => f.profile === profile && /black/.test(f.color)).publicId;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'print-service-'));
  fake = await startFakeSlant({ key: KEY, override: (record) => override?.(record) });
});

afterEach(() => {
  override = undefined;
  fake.state.requests.length = 0;
  fake.state.estimates.length = 0;
});

afterAll(async () => {
  await fake.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('quoting printed parts from Slant 3D', () => {
  it('prices each shape for its copies and uploads two copies of one shape once', async () => {
    const s = await keyed();
    const { replies } = await s.quote({
      shapes: [shape('bracket', [40, 20, 10], { copies: 2 }), shape('plate', [80, 60, 4])],
    });

    expect(replies).toEqual([
      { part: 'bracket', usd: Math.round(fakeUnitUsd([40, 20, 10]) * 2 * 100) / 100 },
      { part: 'plate', usd: fakeUnitUsd([80, 60, 4]) },
    ]);
    expect(fake.state.requests.filter((r) => r.method === 'PUT')).toHaveLength(2);
    expect(fake.state.estimates.map((e) => e.quantity)).toEqual([2, 1]);
  });

  it('sends PETG for a PETG part and PLA for a PLA part', async () => {
    const s = await keyed();

    await s.quote({ shapes: [shape('wheel', [30, 30, 20], { material: 'PETG' }), shape('lid', [20, 20, 2])] });

    expect(fake.state.estimates.map((e) => e.filamentId)).toEqual([filament('PETG'), filament('PLA')]);
  });

  it('lists a part too large for the build volume with the service’s reply, not a price', async () => {
    const s = await keyed();
    const { replies } = await s.quote({ shapes: [shape('chassis', [300, 120, 40]), shape('lid', [20, 20, 2])] });

    expect(replies[0]).toEqual({ part: 'chassis', refusal: 'Part is larger than the 250 mm build volume' });
    expect(replies[1].usd).toBe(fakeUnitUsd([20, 20, 2]));
  });

  it('keeps every price it got when one part fails, and stops at a failure every part would share', async () => {
    const s = await keyed();
    let estimates = 0;

    override = (record) =>
      record.path.endsWith('/estimate') && (estimates += 1) === 1
        ? [200, '{"success":true,"data":{"total":-1}}']
        : undefined;

    const partly = await s.quote({ shapes: [shape('lid', [20, 20, 2]), shape('plate', [80, 60, 4])] });

    expect(partly).toEqual({
      service: 'Slant 3D',
      replies: [{ part: 'plate', usd: fakeUnitUsd([80, 60, 4]) }],
      error: expect.stringMatching(/couldn’t read/),
    });

    let uploads = 0;

    override = (record) =>
      record.path.endsWith('/direct-upload') && (uploads += 1) === 2 ? [503, '{"success":false}'] : undefined;

    const stopped = await s.quote({
      shapes: [shape('lid', [20, 20, 2]), shape('plate', [80, 60, 4]), shape('wheel', [30, 30, 20])],
    });

    expect(stopped.replies).toEqual([{ part: 'lid', usd: fakeUnitUsd([20, 20, 2]) }]);
    expect(stopped.error).toMatch(/couldn’t finish/);
    expect(uploads).toBe(2);
  });

  it('refuses a material the service doesn’t print without uploading it', async () => {
    const s = await keyed();
    const { replies } = await s.quote({ shapes: [shape('duct', [30, 30, 30], { material: 'ABS' })] });

    expect(replies).toEqual([
      { part: 'duct', refusal: 'Slant 3D doesn’t print ABS. Set its material to PLA or PETG.' },
    ]);
    expect(fake.state.requests.some((r) => r.method === 'PUT')).toBe(false);
  });

  it('asks for a key before quoting, and refuses one the service doesn’t accept', async () => {
    await expect(services().quote({ shapes: [shape('lid', [20, 20, 2])] })).rejects.toThrow(NO_KEY);

    const s = services();

    await expect(s.setKey('sl-wrong')).rejects.toThrow(KEY_REFUSED);
    expect(s.status()).toEqual({ name: 'Slant 3D', hasKey: false });
    await s.setKey(KEY);
    expect(s.status()).toEqual({ name: 'Slant 3D', hasKey: true });
  });
});

describe('exploits', () => {
  it('a crafted part name can’t change the request path', async () => {
    const s = await keyed();

    await s.quote({ shapes: [shape('../../orders?cancel=1#', [20, 20, 2], { name: '../../orders?cancel=1#' })] });

    const paths = fake.state.requests.map((r) => r.path.replace(/[0-9a-f-]{36}/, '<id>'));

    expect(
      paths.every((p) => /^\/v2\/api\/(platforms|filaments\?profile=PLA,PETG|files\/.*)$|^\/upload\/\d+$/.test(p)),
    ).toBe(true);
    expect(paths.filter((p) => p.includes('orders'))).toEqual([]);

    const upload = fake.state.requests.find((r) => r.path === '/v2/api/files/direct-upload');

    expect(JSON.parse(upload.body.toString()).name).toBe('-orders-cancel-1-.stl');
  });

  it('refuses a negative or non-finite price', async () => {
    const s = await keyed();

    for (const total of ['-4.5', '1e999']) {
      override = (record) =>
        record.path.endsWith('/estimate')
          ? [200, `{"success":true,"data":{"total":${total},"quantity":1}}`]
          : undefined;

      await expect(s.quote({ shapes: [shape('lid', [20, 20, 2])] })).rejects.toThrow(/couldn’t read/);
    }
  });

  it('refuses a file id that would leave the files path', async () => {
    const s = await keyed();

    override = (record) =>
      record.path.endsWith('/confirm-upload')
        ? [200, { success: true, data: { publicFileServiceId: '../orders' } }]
        : undefined;

    await expect(s.quote({ shapes: [shape('lid', [20, 20, 2])] })).rejects.toThrow(/couldn’t read/);
    expect(fake.state.requests.some((r) => r.path.includes('orders'))).toBe(false);
  });

  it('never uploads to a plain-http address on another host, and never sends the key there', async () => {
    const s = await keyed();
    const seen = [];
    const guarded = new PrintServices({
      libraryDir: dir,
      secrets: null,
      origin: () => fake.origin,
      outbound: async (url, init) => {
        seen.push({ url, auth: init.headers?.Authorization });

        return new Response('');
      },
    });

    await guarded.setKey(KEY);
    override = (record) =>
      record.path.endsWith('/direct-upload')
        ? [200, { success: true, data: { presignedUrl: 'http://198.51.100.7/steal', filePlaceholder: { n: 1 } } }]
        : undefined;

    await expect(guarded.quote({ shapes: [shape('lid', [20, 20, 2])] })).rejects.toThrow(/couldn’t read/);
    expect(seen).toEqual([]);

    override = (record) =>
      record.path.endsWith('/direct-upload')
        ? [200, { success: true, data: { presignedUrl: 'https://bucket.example/put', filePlaceholder: { n: 1 } } }]
        : undefined;
    await guarded.quote({ shapes: [shape('lid', [20, 20, 2])] }).catch(() => {});
    expect(seen).toEqual([{ url: 'https://bucket.example/put', auth: undefined }]);
    expect(s.status().hasKey).toBe(true);
  });

  it('caps a reply and refuses one that isn’t JSON', async () => {
    const s = await keyed();

    override = (record) => (record.path.endsWith('/estimate') ? [200, 'x'.repeat(1_100_000)] : undefined);
    await expect(s.quote({ shapes: [shape('lid', [20, 20, 2])] })).rejects.toThrow(/larger than/);

    override = (record) => (record.path.endsWith('/estimate') ? [200, '<html>'] : undefined);
    await expect(s.quote({ shapes: [shape('lid', [20, 20, 2])] })).rejects.toThrow(/couldn’t read/);
  });

  it('takes a test address only over https or on this computer', () => {
    expect(serviceOrigin('http://127.0.0.1:9000')).toBe('http://127.0.0.1:9000');
    expect(() => serviceOrigin('http://198.51.100.7')).toThrow(/https/);
    expect(serviceOrigin(undefined)).toBe('https://slant3dapi.com');
  });
});
