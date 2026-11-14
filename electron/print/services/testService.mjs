import { once } from 'node:events';
import http from 'node:http';

export const FAKE_PLATFORM = '0b9f6c1e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
export const FAKE_BUILD_MM = 250;

export const FAKE_FILAMENTS = [
  { publicId: '11111111-1111-4111-8111-111111111111', profile: 'PLA', color: 'white', available: true },
  { publicId: '22222222-2222-4222-8222-222222222222', profile: 'PLA', color: 'matte black', available: true },
  { publicId: '33333333-3333-4333-8333-333333333333', profile: 'PETG', color: 'black', available: true },
];

const fileId = (n) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}`;

function stlSize(bytes) {
  const count = bytes.length >= 84 ? bytes.readUInt32LE(80) : 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let f = 0; f < count; f++)
    for (let v = 0; v < 3; v++)
      for (let k = 0; k < 3; k++) {
        const value = bytes.readFloatLE(84 + f * 50 + 12 + v * 12 + k * 4);

        min[k] = Math.min(min[k], value);
        max[k] = Math.max(max[k], value);
      }

  return count ? max.map((m, k) => m - min[k]) : [0, 0, 0];
}

export const fakeUnitUsd = ([x, y, z]) => Math.round((1.5 + (x * y * z) / 50000) * 100) / 100;

function estimate(state, id, body) {
  const file = state.files.get(id);

  if (!file) return [404, { success: false, message: 'File not found' }];

  if (file.size.some((s) => s > FAKE_BUILD_MM))
    return [400, { success: false, message: `Part is larger than the ${FAKE_BUILD_MM} mm build volume` }];

  const quantity = body?.options?.quantity ?? 1;
  const unit = fakeUnitUsd(file.size);

  state.estimates.push({ id, filamentId: body?.options?.filamentId, quantity });

  return [
    200,
    {
      success: true,
      message: 'ok',
      data: { total: Math.round(unit * quantity * 100) / 100, quantity, pricePerUnit: unit },
    },
  ];
}

function confirmed(state, body) {
  const n = body?.filePlaceholder?.n;
  const bytes = state.uploads.get(n);

  if (!bytes) return [400, { success: false, message: 'Upload not found' }];

  state.files.set(fileId(n), { size: stlSize(bytes), name: body.filePlaceholder.name });

  return [200, { success: true, data: { publicFileServiceId: fileId(n) } }];
}

function api(state, { method, route, body, origin }) {
  if (method === 'GET' && route === '/platforms') return [200, { success: true, data: [{ id: FAKE_PLATFORM }] }];

  if (method === 'GET' && route.startsWith('/filaments')) return [200, { success: true, data: FAKE_FILAMENTS }];

  if (method === 'POST' && route === '/files/direct-upload') {
    const n = (state.next += 1);

    return [
      200,
      { success: true, data: { presignedUrl: `${origin}/upload/${n}`, filePlaceholder: { n, name: body?.name } } },
    ];
  }

  if (method === 'POST' && route === '/files/confirm-upload') return confirmed(state, body);

  const match = /^\/files\/([^/]+)\/estimate$/.exec(route);

  if (method === 'POST' && match) return estimate(state, match[1], body);

  return [404, { success: false, message: 'Not found' }];
}

function respond(state, { key, record, origin }) {
  const upload = /^\/upload\/(\d+)$/.exec(record.path);

  if (record.method === 'PUT' && upload) {
    state.uploads.set(Number(upload[1]), record.body);

    return [200, ''];
  }

  if (!record.path.startsWith('/v2/api/')) return [404, { success: false, message: 'Not found' }];

  if (record.auth !== `Bearer ${key}`) return [401, { success: false, message: 'Invalid API key' }];

  const body = record.body.length ? JSON.parse(record.body.toString()) : undefined;

  return api(state, { method: record.method, route: record.path.slice('/v2/api'.length), body, origin });
}

export async function startFakeSlant({ key, port = 0, override } = {}) {
  const state = { requests: [], uploads: new Map(), files: new Map(), estimates: [], next: 0 };
  let origin = '';
  const server = http.createServer(async (req, res) => {
    const chunks = [];

    for await (const chunk of req) chunks.push(chunk);

    const record = { method: req.method, path: req.url, auth: req.headers.authorization, body: Buffer.concat(chunks) };

    state.requests.push(record);

    const [status, reply] = override?.(record) ?? respond(state, { key, record, origin });

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof reply === 'string' ? reply : JSON.stringify(reply));
  });

  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${server.address().port}`;

  return { origin, state, close: () => new Promise((resolve) => server.close(resolve)) };
}
