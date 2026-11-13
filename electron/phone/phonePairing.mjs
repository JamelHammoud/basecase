import crypto from 'node:crypto';
import https from 'node:https';
import os from 'node:os';
import { deviceName } from './phoneMessage.mjs';
import {
  isTrustedPhoneRequest,
  isWebSocketHandshake,
  refuse,
  refuseUpgrade,
  sendPage,
  tokenMatches,
} from './phoneRequest.mjs';
import { PhoneSocket } from './phoneSocket.mjs';
import { selfSignedCert } from './selfSignedCert.mjs';
import { acceptKey, CLOSE } from './wsFrames.mjs';

export const PAIRING_TIMEOUT_MS = 5 * 60 * 1000;

const isLanIPv4 = (entry) =>
  (entry?.family === 'IPv4' || entry?.family === 4) && !entry.internal && !entry.address.startsWith('169.254.');

export function lanAddress() {
  return Object.values(os.networkInterfaces()).flat().find(isLanIPv4)?.address ?? null;
}

function listen(server, ip) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: ip, port: 0 }, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function requestUrl(req, origin) {
  try {
    return new URL(req.url ?? '/', origin);
  } catch {
    return null;
  }
}

const pairingOf = (run) => ({ url: `${run.origin}/?t=${run.token}`, token: run.token, cert: run.cert });

export class PhonePairing {
  #emit;
  #address;
  #listeners = new Set();
  #run = null;
  #generation = 0;

  constructor({ emit, address = lanAddress } = {}) {
    this.#emit = emit;
    this.#address = address;
  }

  subscribe(listener) {
    this.#listeners.add(listener);

    return () => this.#listeners.delete(listener);
  }

  async pair() {
    this.unpair();

    const generation = ++this.#generation;
    const ip = this.#address();

    if (!ip) return { ok: false, message: 'Connect to a network to pair a phone' };

    try {
      const run = await this.#start(ip);

      if (generation !== this.#generation) {
        run.server.close();

        return { ok: false };
      }

      this.#run = run;
      run.timer = setTimeout(() => this.#end(CLOSE.normal), PAIRING_TIMEOUT_MS).unref();

      return { ok: true, ...pairingOf(run) };
    } catch {
      return { ok: false, message: "Couldn't start pairing" };
    }
  }

  unpair() {
    this.#generation++;
    this.#end(CLOSE.normal);

    return { ok: true };
  }

  state() {
    const run = this.#run;

    if (!run) return { status: 'off' };

    if (run.phone) return { status: 'connected', name: run.name };

    return { status: 'pairing', ...pairingOf(run) };
  }

  dispose() {
    this.unpair();
    this.#listeners.clear();
  }

  #send(event) {
    this.#emit?.(event);

    for (const listener of this.#listeners) listener(event);
  }

  async #start(ip) {
    const { key, cert } = selfSignedCert(ip);
    const server = https.createServer({ key, cert });
    const token = crypto.randomBytes(32).toString('base64url');
    const run = { server, ip, cert, sockets: new Set(), token, used: false };

    server.on('connection', (socket) => {
      run.sockets.add(socket);
      socket.on('close', () => run.sockets.delete(socket));
    });
    server.on('request', (req, res) => this.#request(run, req, res));
    server.on('upgrade', (req, socket, head) => this.#upgrade({ run, req, socket, head }));

    const port = await listen(server, ip);

    run.host = `${ip}:${port}`;
    run.origin = `https://${run.host}`;

    return run;
  }

  #request(run, req, res) {
    if (!isTrustedPhoneRequest(req.headers, run)) {
      refuse(res, 403);

      return;
    }

    const url = requestUrl(req, run.origin);

    if (req.method !== 'GET' || url?.pathname !== '/') {
      refuse(res, 404);

      return;
    }

    if (run.used || !tokenMatches(url.searchParams.get('t'), run.token)) {
      refuse(res, 403);

      return;
    }

    sendPage(res, run.origin);
  }

  #upgradeStatus(run, req) {
    if (!isTrustedPhoneRequest(req.headers, run)) return 403;

    const url = requestUrl(req, run.origin);

    if (url?.pathname !== '/socket') return 404;

    if (!isWebSocketHandshake(req)) return 400;

    if (run.used || this.#run !== run || !tokenMatches(url.searchParams.get('t'), run.token)) return 403;

    return 101;
  }

  #upgrade({ run, req, socket, head }) {
    socket.on('error', () => socket.destroy());

    const status = this.#upgradeStatus(run, req);

    if (status !== 101) {
      refuseUpgrade(socket, status);

      return;
    }

    run.used = true;
    clearTimeout(run.timer);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey(req.headers['sec-websocket-key'])}\r\n\r\n`,
    );
    run.name = deviceName(req.headers['user-agent']);
    run.phone = new PhoneSocket({
      socket,
      head,
      onInput: (message) => this.#send({ type: 'phone-input', ...message }),
      onEnd: (code) => this.#endRun(run, code),
    });
    this.#send({ type: 'phone', state: 'connected', name: run.name });
  }

  #endRun(run, code) {
    if (this.#run === run) this.#end(code);
  }

  #end(code) {
    const run = this.#run;

    if (!run) return;

    const phone = run.phone?.remote;

    this.#run = null;
    clearTimeout(run.timer);
    run.phone?.close(code);
    run.server.close();

    for (const socket of run.sockets) {
      if (`${socket.remoteAddress}:${socket.remotePort}` !== phone) socket.destroy();
    }

    this.#send({ type: 'phone', state: 'closed' });
  }
}
