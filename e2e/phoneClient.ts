import { randomBytes } from 'node:crypto';
import https from 'node:https';
import type { Socket } from 'node:net';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';
import { maskedFrame, OPCODE } from '../electron/phone/wsFrames.mjs';

export interface PhoneSocket {
  send(text: string): void;

  sendRaw(bytes: Buffer): void;

  close(): void;

  closed: Promise<void>;
  closeCode(): number | null;
}

export interface PhoneRequestOptions {
  ca: string;
  headers?: Record<string, string>;
}

export class PhoneRefused extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Refused with ${status}`);
    this.status = status;
  }
}

const pinnedTo = (target: URL, ca: string) => ({
  agent: false,
  ca,
  checkServerIdentity: (_host: string, cert: PeerCertificate) => checkServerIdentity(target.hostname, cert),
});

function socketPath(target: URL) {
  const path = target.pathname === '/' ? '/socket' : target.pathname;

  return `${path}${target.search}`;
}

function serverCloseCode(bytes: Buffer) {
  for (let at = 0; at + 2 <= bytes.length; at += 2 + (bytes[at + 1] & 0x7f)) {
    const isClose = (bytes[at] & 0x0f) === OPCODE.close;

    if (isClose && (bytes[at + 1] & 0x7f) >= 2 && at + 4 <= bytes.length) return bytes.readUInt16BE(at + 2);
  }

  return null;
}

function phoneSocket(socket: Socket, head: Buffer): PhoneSocket {
  let code = serverCloseCode(head);

  socket.on('data', (chunk: Buffer) => {
    code = code ?? serverCloseCode(chunk);
  });
  socket.on('error', () => socket.destroy());

  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));

  return {
    send: (text) => socket.write(maskedFrame(OPCODE.text, text)),
    sendRaw: (bytes) => socket.write(bytes),
    close: () => socket.end(maskedFrame(OPCODE.close, Buffer.from([0x03, 0xe8]))),
    closed,
    closeCode: () => code,
  };
}

export function connectPhone(url: string, opts: PhoneRequestOptions): Promise<PhoneSocket> {
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: target.hostname,
      port: target.port,
      path: socketPath(target),
      method: 'GET',
      ...pinnedTo(target, opts.ca),
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
        Origin: target.origin,
        ...opts.headers,
      },
    });

    req.on('upgrade', (_res, socket, head) => resolve(phoneSocket(socket, head)));
    req.on('response', (res) => {
      res.resume();
      reject(new PhoneRefused(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

export function fetchPage(url: string, opts: PhoneRequestOptions): Promise<number> {
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request({
      host: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      ...pinnedTo(target, opts.ca),
      headers: opts.headers,
    });

    req.on('response', (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}
