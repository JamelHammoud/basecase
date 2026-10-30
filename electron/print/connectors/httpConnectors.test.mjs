import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connectorFor } from './index.mjs';

let server;
let host;
let dir;
let file;
let requests = [];
let routes = {};

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'connectors-'));
  file = path.join(dir, 'plate.gcode');
  fs.writeFileSync(file, 'G28\nG1 X10\n');
  server = http.createServer(async (request, response) => {
    const chunks = [];

    for await (const chunk of request) chunks.push(chunk);

    const record = { method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks) };
    const route = routes[`${request.method} ${request.url.split('?')[0]}`] ?? [404, { error: 'Not found' }];
    const [status, body] = typeof route === 'function' ? route(record) : route;

    requests.push(record);
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(body === undefined ? '' : JSON.stringify(body));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  host = `127.0.0.1:${server.address().port}`;
});

afterEach(() => {
  requests = [];
  routes = {};
});

afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const printer = (kind) => ({ id: 'p', nickname: 'Shop printer', modelId: 'x', connection: { kind, host } });

describe('Moonraker', () => {
  it('uploads and starts, then maps a running print', async () => {
    routes = {
      'POST /server/files/upload': [201, { result: { item: { path: 'plate.gcode' }, print_started: true } }],
      'GET /printer/objects/query': [
        200,
        {
          result: {
            status: {
              print_stats: {
                state: 'printing',
                filename: 'plate.gcode',
                print_duration: 600,
                info: { current_layer: 12, total_layer: 80 },
              },
              virtual_sdcard: { progress: 0.25 },
            },
          },
        },
      ],
      'POST /printer/print/pause': [200, { result: 'ok' }],
    };

    const connector = connectorFor(printer('moonraker'), 'key-1');
    const sent = await connector.send({ file, name: 'plate.gcode', start: true });
    const upload = requests[0];

    expect(sent).toEqual({ started: true, message: 'Started plate.gcode' });
    expect(upload.headers['x-api-key']).toBe('key-1');
    expect(upload.headers['content-type']).toMatch(/^multipart\/form-data/);
    expect(upload.body.toString()).toContain('filename="plate.gcode"');
    expect(upload.body.toString()).toContain('G28');
    expect(upload.body.toString()).toMatch(/name="print"\r\n\r\ntrue/);
    expect(await connector.status()).toEqual({
      state: 'printing',
      progress: 0.25,
      layer: 12,
      totalLayers: 80,
      remainingMin: 30,
      job: 'plate.gcode',
    });

    await connector.pause();

    expect(requests.at(-1).method).toBe('POST');
    expect(requests.at(-1).url).toBe('/printer/print/pause');
  });

  it('reports a Klipper error and an unknown key', async () => {
    routes = {
      'GET /printer/objects/query': [
        200,
        {
          result: {
            status: { print_stats: { state: 'error', message: 'Heater extruder not heating at expected rate' } },
          },
        },
      ],
      'GET /server/info': [401, { error: { message: 'Unauthorized' } }],
    };

    const connector = connectorFor(printer('moonraker'), 'wrong');

    expect(await connector.status()).toEqual({
      state: 'failed',
      message: 'Heater extruder not heating at expected rate',
    });
    expect(await connector.test()).toEqual({
      ok: false,
      message: 'Check the API key. Find it in Mainsail or Fluidd: Settings → Authorization.',
    });
  });
});

describe('PrusaLink', () => {
  it('uploads with headers, reads status and cancels the current job', async () => {
    routes = {
      'PUT /api/v1/files/usb/robot%20arm.gcode': [201, undefined],
      'GET /api/v1/status': [
        200,
        { printer: { state: 'PRINTING' }, job: { id: 31, progress: 40, time_remaining: 3600 } },
      ],
      'GET /api/v1/job': [200, { id: 31, file: { name: 'ROBOTA~1.GCO', display_name: 'robot arm.gcode' } }],
      'DELETE /api/v1/job/31': [204, undefined],
    };

    const connector = connectorFor(printer('prusalink'), 'prusa-key');
    const sent = await connector.send({ file, name: 'robot arm.gcode', start: true });
    const upload = requests[0];

    expect(sent.started).toBe(true);
    expect(upload.headers).toMatchObject({
      'x-api-key': 'prusa-key',
      'content-type': 'application/octet-stream',
      overwrite: '?1',
      'print-after-upload': '?1',
    });
    expect(upload.body.toString()).toBe('G28\nG1 X10\n');
    expect(await connector.status()).toEqual({
      state: 'printing',
      progress: 0.4,
      remainingMin: 60,
      job: 'robot arm.gcode',
    });

    await connector.cancel();

    expect(requests.at(-1)).toMatchObject({ method: 'DELETE', url: '/api/v1/job/31' });
  });

  it('asks for the API key on 401 and says when nothing is printing', async () => {
    routes = {
      'GET /api/v1/info': [401, undefined],
      'GET /api/v1/status': [200, { printer: { state: 'IDLE' } }],
    };

    const connector = connectorFor(printer('prusalink'), 'bad');

    expect((await connector.test()).message).toBe(
      'Check the API key. It’s on the printer: Settings → Network → PrusaLink.',
    );
    expect(await connector.status()).toEqual({ state: 'idle' });
    await expect(connector.pause()).rejects.toThrow('No print is running.');
  });
});

describe('OctoPrint', () => {
  it('uploads and selects for printing, maps status and pauses', async () => {
    routes = {
      'POST /api/files/local': [201, { done: true, files: { local: { name: 'plate.gcode' } } }],
      'GET /api/job': [
        200,
        {
          state: 'Printing',
          job: { file: { name: 'plate.gcode' } },
          progress: { completion: 12.5, printTimeLeft: 1800 },
        },
      ],
      'POST /api/job': [204, undefined],
      'GET /api/version': [200, { api: '0.1', server: '1.10.0' }],
    };

    const connector = connectorFor(printer('octoprint'), 'octo-key');

    expect(await connector.test()).toEqual({ ok: true, message: 'Connected to Shop printer' });
    expect(await connector.send({ file, name: 'plate.gcode', start: true })).toEqual({
      started: true,
      message: 'Started plate.gcode',
    });
    expect(requests[1].body.toString()).toMatch(/name="print"\r\n\r\ntrue/);
    expect(await connector.status()).toEqual({
      state: 'printing',
      progress: 0.125,
      remainingMin: 30,
      job: 'plate.gcode',
    });

    await connector.pause();

    expect(JSON.parse(requests.at(-1).body.toString())).toEqual({ command: 'pause', action: 'pause' });
  });

  it('maps finished, offline and refused requests', async () => {
    routes = { 'GET /api/job': [200, { state: 'Operational', progress: { completion: 100 } }] };

    const connector = connectorFor(printer('octoprint'), 'octo-key');

    expect(await connector.status()).toMatchObject({ state: 'finished', progress: 1 });

    routes = { 'GET /api/job': [200, { state: 'Offline', progress: {} }] };

    expect((await connector.status()).state).toBe('offline');

    routes = { 'POST /api/job': [409, { error: 'Printer is not operational' }] };

    await expect(connector.cancel()).rejects.toThrow('The printer is busy: Printer is not operational.');
  });
});

describe('unreachable printers', () => {
  it('says the printer can’t be reached', async () => {
    const closed = http.createServer();

    closed.listen(0, '127.0.0.1');
    await once(closed, 'listening');

    const address = `127.0.0.1:${closed.address().port}`;

    closed.close();

    const connector = connectorFor({ connection: { kind: 'moonraker', host: address } });

    expect(await connector.status()).toEqual({
      state: 'offline',
      message: `Couldn’t reach the printer at ${address}. Check it’s on and on the same network.`,
    });
  });
});
