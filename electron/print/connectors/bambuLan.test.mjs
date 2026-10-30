import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBambuConnect } from './bambuConnect.mjs';
import { createBambuLan, jobTitle } from './bambuLan.mjs';
import { connectorFor } from './index.mjs';
import { selfSignedCert, startFtpsServer, startMqttBroker } from './testServers.mjs';

const SERIAL = '01P00A123456789';
const CODE = '12345678';
const credentials = selfSignedCert();

async function until(check) {
  for (let attempt = 0; attempt < 100 && !check(); attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
}

const REPORTS = [
  { print: { gcode_state: 'RUNNING', mc_percent: 10, layer_num: 3, total_layer_num: 90, subtask_name: 'hip' } },
  { print: { mc_percent: 11, mc_remaining_time: 52 } },
];

describe('Bambu LAN setup', () => {
  it('asks for the serial number and access code before connecting', async () => {
    const noSerial = connectorFor({ connection: { kind: 'bambu-lan', host: 'printer.local' } }, CODE);
    const noCode = connectorFor({ connection: { kind: 'bambu-lan', host: 'printer.local', serial: SERIAL } });

    expect((await noSerial.test()).message).toMatch(/^Add the printer’s serial number/);
    expect((await noCode.test()).message).toMatch(/^Add the printer’s access code/);
  });

  it('names the print after the file', () => {
    expect(jobTitle('robot arm.gcode.3mf')).toBe('robot arm');
    expect(jobTitle('part.3mf')).toBe('part');
  });
});

describe.skipIf(!credentials)('Bambu LAN', () => {
  let dir;
  let file;
  let broker;
  let ftps;
  let connector;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bambu-'));
    file = path.join(dir, 'arm.gcode.3mf');
    fs.writeFileSync(file, 'sliced');
  });

  afterEach(() => {
    connector?.close();
    broker?.close();
    ftps?.close();
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const connect = async (code) => {
    broker = await startMqttBroker({ credentials, password: CODE, serial: SERIAL, reports: REPORTS });
    ftps = await startFtpsServer({ credentials, password: CODE });
    connector = createBambuLan(
      { nickname: 'Garage P1S', connection: { kind: 'bambu-lan', host: '127.0.0.1', serial: SERIAL } },
      code,
      { mqttPort: broker.port, ftpsPort: ftps.port, reportWaitMs: 1000 },
    );
  };

  it('connects, asks for a full report and merges deltas', async () => {
    await connect(CODE);

    expect(await connector.test()).toEqual({ ok: true, message: 'Connected to Garage P1S' });
    expect(broker.state.requests[0]).toEqual({ pushing: { sequence_id: '0', command: 'pushall' } });
    await until(() => connector.print.mc_remaining_time !== undefined);
    expect(await connector.status()).toEqual({
      state: 'printing',
      progress: 0.11,
      layer: 3,
      totalLayers: 90,
      remainingMin: 52,
      job: 'hip',
    });
  });

  it('uploads over FTPS and starts the plate', async () => {
    await connect(CODE);

    const sent = await connector.send({
      file,
      name: 'arm.gcode.3mf',
      plate: 2,
      start: true,
      useAms: true,
      amsMapping: [0, 2],
    });

    expect(sent).toEqual({ started: true, message: 'Started arm.gcode.3mf' });
    expect(ftps.state.files['/arm.gcode.3mf'].toString()).toBe('sliced');
    await until(() => broker.state.requests.some((request) => request.print));
    expect(broker.state.requests.at(-1).print).toMatchObject({
      sequence_id: '1',
      command: 'project_file',
      param: 'Metadata/plate_2.gcode',
      url: 'ftp:///arm.gcode.3mf',
      subtask_name: 'arm',
      use_ams: true,
      ams_mapping: [0, 2],
    });

    await connector.pause();
    await connector.cancel();
    await until(() => broker.state.requests.length === 4);

    expect(broker.state.requests.slice(-2).map((request) => request.print)).toEqual([
      { sequence_id: '2', command: 'pause' },
      { sequence_id: '3', command: 'stop' },
    ]);
  });

  it('explains a wrong access code', async () => {
    await connect('00000000');

    expect(await connector.test()).toEqual({
      ok: false,
      message: 'Check the access code on the printer: Settings → LAN Only.',
    });
    expect(await connector.status()).toMatchObject({ state: 'offline' });
    await expect(connector.send({ file, name: 'arm.gcode.3mf', start: false })).rejects.toThrow(
      'Check the access code on the printer: Settings → LAN Only.',
    );
  });
});

describe('Bambu Connect', () => {
  it('opens the file in Bambu Connect with its URL scheme', async () => {
    const calls = [];
    const connector = createBambuConnect(
      {},
      { platform: 'darwin', exists: () => true, run: async (...args) => calls.push(args) },
    );

    expect(connector).toMatchObject({ kind: 'bambu-connect', canStatus: false, canStart: false });

    const sent = await connector.send({ file: '/Users/me/My Plates/arm.gcode.3mf', name: 'arm & leg.gcode.3mf' });

    expect(sent).toEqual({ started: false, message: 'Opened in Bambu Connect' });
    expect(calls).toEqual([
      [
        'open',
        [
          'bambu-connect://import-file?path=%2FUsers%2Fme%2FMy%20Plates%2Farm.gcode.3mf&name=arm%20%26%20leg.gcode.3mf&version=1.0.0',
        ],
      ],
    ]);
    expect(await connector.status()).toEqual({ state: 'idle' });
  });

  it('asks to install Bambu Connect when it’s missing', async () => {
    const connector = createBambuConnect({}, { platform: 'darwin', exists: () => false, run: async () => {} });

    expect(await connector.test()).toEqual({
      ok: false,
      message: 'Install Bambu Connect from bambulab.com, then try again.',
    });
  });
});
