import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FtpReplies, parseEpsv, parsePasv, uploadFile } from './ftps.mjs';
import { selfSignedCert, startFtpsServer } from './testServers.mjs';

describe('FTP replies', () => {
  it('reads single, multi-line and split replies', () => {
    const replies = new FtpReplies();

    expect(replies.push('220 Ready\r\n331 Pass')).toEqual([{ code: 220, text: '220 Ready' }]);
    expect(replies.push('word required\r\n230-Welcome\r\n line two\r\n230 Logged')).toEqual([
      { code: 331, text: '331 Password required' },
    ]);
    expect(replies.push(' in\r\n')).toEqual([{ code: 230, text: '230-Welcome\n line two\n230 Logged in' }]);
  });

  it('reads PASV and EPSV addresses', () => {
    expect(parsePasv('227 Entering Passive Mode (192,168,1,40,195,80).')).toEqual({
      host: [192, 168, 1, 40].join('.'),
      port: 195 * 256 + 80,
    });
    expect(parsePasv('227 Entering Passive Mode')).toBeNull();
    expect(parseEpsv('229 Entering Extended Passive Mode (|||6446|)')).toBe(6446);
    expect(parseEpsv('229 Entering Extended Passive Mode (!!!50001!)')).toBe(50001);
    expect(parseEpsv('500 Unknown command')).toBeNull();
  });
});

const credentials = selfSignedCert();

describe.skipIf(!credentials)('FTPS upload', () => {
  let dir;
  let file;
  let server;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftps-'));
    file = path.join(dir, 'plate.gcode.3mf');
    fs.writeFileSync(file, Buffer.alloc(200_000, 7));
  });

  afterEach(() => server?.close());

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const upload = (password) =>
    uploadFile({
      host: '127.0.0.1',
      port: server.port,
      user: 'bblp',
      password,
      file,
      remotePath: '/plate.gcode.3mf',
    });

  it('logs in, protects the data channel and stores the file', async () => {
    server = await startFtpsServer({ credentials, password: '12345678' });
    await upload('12345678');

    expect(server.state.commands).toEqual([
      'USER bblp',
      'PASS 12345678',
      'PBSZ 0',
      'PROT P',
      'TYPE I',
      'PASV',
      'STOR /plate.gcode.3mf',
      'QUIT',
    ]);
    expect(server.state.files['/plate.gcode.3mf']).toEqual(fs.readFileSync(file));
  });

  it('reports a wrong password and a full card', async () => {
    server = await startFtpsServer({ credentials, password: '12345678' });

    await expect(upload('00000000')).rejects.toMatchObject({ reason: 'auth' });

    server.close();
    server = await startFtpsServer({ credentials, password: '12345678', storeCode: 553 });

    await expect(upload('12345678')).rejects.toMatchObject({ reason: 'storage' });
  });
});
