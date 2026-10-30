import { once } from 'node:events';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import tls from 'node:tls';

const REPLY_TIMEOUT_MS = 15000;
const TRANSFER_IDLE_MS = 30000;
const STORAGE_CODES = new Set([450, 451, 452, 550, 552, 553]);

export class FtpError extends Error {
  constructor(reason, detail) {
    super(detail ? `FTP ${reason}: ${detail}` : `FTP ${reason}`);
    this.reason = reason;
  }
}

export class FtpReplies {
  constructor() {
    this.partial = '';
    this.pending = null;
  }

  push(chunk) {
    const lines = (this.partial + chunk).split('\n');

    this.partial = lines.pop();

    return lines.map((line) => this.line(line.replace(/\r$/, ''))).filter(Boolean);
  }

  line(text) {
    if (this.pending) return this.continued(text);

    const match = /^(\d{3})([ -])(.*)$/.exec(text);

    if (!match) return null;

    if (match[2] === ' ') return { code: Number(match[1]), text };

    this.pending = { code: match[1], lines: [text] };

    return null;
  }

  continued(text) {
    this.pending.lines.push(text);

    if (!text.startsWith(`${this.pending.code} `)) return null;

    const reply = { code: Number(this.pending.code), text: this.pending.lines.join('\n') };

    this.pending = null;

    return reply;
  }
}

export function parsePasv(text) {
  const match = /(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3}),(\d{1,3})/.exec(text);

  if (!match) return null;

  const [a, b, c, d, high, low] = match.slice(1).map(Number);

  return { host: `${a}.${b}.${c}.${d}`, port: high * 256 + low };
}

export function parseEpsv(text) {
  const match = /\((.)\1\1(\d+)\1\)/.exec(text);

  return match ? Number(match[2]) : null;
}

class FtpControl {
  constructor(socket) {
    this.socket = socket;
    this.replies = new FtpReplies();
    this.queue = [];
    this.waiters = [];
    this.error = null;
    socket.on('data', (chunk) => this.receive(chunk.toString('utf8')));
    socket.on('error', (error) => this.fail(new FtpError('unreachable', error.message)));
    socket.on('close', () => this.fail(new FtpError('unreachable', 'connection closed')));
  }

  receive(chunk) {
    for (const reply of this.replies.push(chunk)) {
      const waiter = this.waiters.shift();

      if (waiter) waiter.resolve(reply);
      else this.queue.push(reply);
    }
  }

  fail(error) {
    this.error ??= error;

    for (const waiter of this.waiters.splice(0)) waiter.reject(this.error);
  }

  next(timeoutMs = REPLY_TIMEOUT_MS) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());

    if (this.error) return Promise.reject(this.error);

    return new Promise((resolve, reject) => {
      const waiter = {
        resolve(reply) {
          clearTimeout(timer);
          resolve(reply);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new FtpError('timeout'));
      }, timeoutMs);

      this.waiters.push(waiter);
    });
  }

  send(command, timeoutMs) {
    this.socket.write(`${command}\r\n`);

    return this.next(timeoutMs);
  }

  close() {
    this.socket.destroy();
  }
}

async function connectTls(options, timeoutMs) {
  const socket = tls.connect({ rejectUnauthorized: false, ...options });
  const timer = setTimeout(() => socket.destroy(new FtpError('timeout')), timeoutMs);

  try {
    await once(socket, 'secureConnect');

    return socket;
  } catch (error) {
    throw error instanceof FtpError ? error : new FtpError('unreachable', error.message);
  } finally {
    clearTimeout(timer);
  }
}

function requireReply(reply, codes, reason = 'protocol') {
  if (!codes.includes(reply.code)) throw new FtpError(reason, reply.text);

  return reply;
}

async function login(control, user, password) {
  const userReply = await control.send(`USER ${user}`);

  if (userReply.code === 230) return;

  requireReply(userReply, [331], userReply.code === 530 ? 'auth' : 'protocol');
  requireReply(await control.send(`PASS ${password}`), [230, 202], 'auth');
}

async function passivePort(control) {
  const reply = await control.send('PASV');
  const address = reply.code === 227 ? parsePasv(reply.text) : null;

  if (address) return address.port;

  const extended = await control.send('EPSV');
  const port = extended.code === 229 ? parseEpsv(extended.text) : null;

  if (!port) throw new FtpError('protocol', extended.text);

  return port;
}

async function store(control, { host, port, file, remotePath }) {
  const data = tls.connect({ host, port, session: control.socket.getSession(), rejectUnauthorized: false });
  const secured = once(data, 'secureConnect');

  secured.catch(() => {});
  data.setTimeout(TRANSFER_IDLE_MS, () => data.destroy(new FtpError('timeout')));

  try {
    const reply = await control.send(`STOR ${remotePath}`);

    requireReply(reply, [125, 150], STORAGE_CODES.has(reply.code) ? 'storage' : 'protocol');
    await secured;
    await pipeline(fs.createReadStream(file), data);

    const done = await control.next(TRANSFER_IDLE_MS);

    requireReply(done, [226, 250], STORAGE_CODES.has(done.code) ? 'storage' : 'protocol');
  } finally {
    data.destroy();
  }
}

export async function uploadFile({ host, port = 990, user, password, file, remotePath, timeoutMs = REPLY_TIMEOUT_MS }) {
  const socket = await connectTls({ host, port }, timeoutMs);
  const control = new FtpControl(socket);

  try {
    requireReply(await control.next(timeoutMs), [220]);
    await login(control, user, password);
    requireReply(await control.send('PBSZ 0'), [200]);
    requireReply(await control.send('PROT P'), [200]);
    requireReply(await control.send('TYPE I'), [200]);

    const dataPort = await passivePort(control);

    await store(control, { host, port: dataPort, file, remotePath });
    await control.send('QUIT', 2000).catch(() => {});
  } finally {
    control.close();
  }
}
