import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { PACKET, decodePublish, encodePublish, splitPackets } from './mqtt.mjs';

export function selfSignedCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-cert-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');

  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        cert,
        '-days',
        '1',
        '-subj',
        '/CN=test',
      ],
      { stdio: 'ignore' },
    );

    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return server.address().port;
}

function ftpReply(command, { password, dataPort, storeCode }) {
  const [verb, ...rest] = command.split(' ');
  const replies = {
    USER: '331 Password required',
    PASS: rest.join(' ') === password ? '230 Logged in' : '530 Login incorrect',
    PBSZ: '200 PBSZ=0',
    PROT: '200 Protection set to Private',
    TYPE: '200 Switching to Binary mode',
    PASV: `227 Entering Passive Mode (127,0,0,1,${dataPort >> 8},${dataPort & 255}).`,
    STOR: storeCode === 150 ? '150 Ok to send data' : `${storeCode} Could not create file`,
    QUIT: '221 Goodbye',
  };

  return replies[verb] ?? '502 Command not implemented';
}

export async function startFtpsServer({ credentials, password, storeCode = 150 }) {
  const state = { commands: [], files: {}, control: null, storing: null };
  const data = tls.createServer(credentials, (socket) => {
    const chunks = [];

    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => {
      state.files[state.storing] = Buffer.concat(chunks);
      state.control?.write('226 Transfer complete\r\n');
      socket.end();
    });
  });
  const dataPort = await listen(data);
  const control = tls.createServer(credentials, (socket) => {
    let partial = '';

    state.control = socket;
    socket.write('220 Welcome\r\n');
    socket.on('data', (chunk) => {
      const lines = (partial + chunk.toString()).split('\r\n');

      partial = lines.pop();

      for (const line of lines) {
        state.commands.push(line);
        state.storing = line.startsWith('STOR ') ? line.slice(5) : state.storing;
        socket.write(`${ftpReply(line, { password, dataPort, storeCode })}\r\n`);
      }
    });
    socket.on('error', () => {});
  });

  return {
    state,
    port: await listen(control),
    close() {
      control.close();
      data.close();
    },
  };
}

function connackFor(packet, password) {
  const body = packet.body;
  const clientIdLength = body.readUInt16BE(10);
  const userStart = 12 + clientIdLength;
  const userLength = body.readUInt16BE(userStart);
  const passwordStart = userStart + 2 + userLength;
  const given = body.toString('utf8', passwordStart + 2, passwordStart + 2 + body.readUInt16BE(passwordStart));

  return Buffer.from([PACKET.CONNACK << 4, 2, 0, given === password ? 0 : 5]);
}

export async function startMqttBroker({ credentials, password, serial, reports = [] }) {
  const state = { requests: [], subscriptions: 0 };
  const server = tls.createServer(credentials, (socket) => {
    let buffer = Buffer.alloc(0);
    const send = (report) => socket.write(encodePublish(`device/${serial}/report`, JSON.stringify(report)));
    const handle = (packet) => {
      if (packet.type === PACKET.CONNECT) socket.write(connackFor(packet, password));

      if (packet.type === PACKET.SUBSCRIBE) state.subscriptions += 1;

      if (packet.type !== PACKET.PUBLISH) return;

      const request = JSON.parse(decodePublish(packet).payload.toString());

      state.requests.push(request);

      if (request.pushing?.command === 'pushall') reports.forEach(send);
    };

    socket.on('data', (chunk) => {
      const { packets, rest } = splitPackets(Buffer.concat([buffer, chunk]));

      buffer = Buffer.from(rest);
      packets.forEach(handle);
    });
    socket.on('error', () => {});
  });

  return { state, port: await listen(server), close: () => server.close() };
}
