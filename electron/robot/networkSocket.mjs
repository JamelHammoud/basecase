import { createHmac, timingSafeEqual } from 'node:crypto';
import net from 'node:net';
import { IntentPacer } from './intentPacer.mjs';
import { isPairingKey } from './networkCredentials.mjs';

export const NETWORK_MAX_LINE = 64 * 1024;

const HANDSHAKE_MS = 5000;
const RESPONSE_MS = 1000;
const MAX_QUEUED = 24 * 1024 * 1024;
const hmac = (key, text) => createHmac('sha256', Buffer.from(key, 'hex')).update(text).digest('hex');

export const authenticationProof = (key, nonce) => hmac(key, `basecase-robot-v1:${nonce}`);
export const signedCommand = (key, nonce, seq, command) => {
  const body = JSON.stringify(command);

  return { seq, body, mac: hmac(key, `${nonce}:${seq}:${body}`) };
};

function lineReader(onLine, fail) {
  let partial = '';

  return (chunk) => {
    const text = String(chunk);
    let start = 0;

    for (let end = text.indexOf('\n'); end !== -1; end = text.indexOf('\n', start)) {
      if (Buffer.byteLength(partial) + Buffer.byteLength(text.slice(start, end)) > NETWORK_MAX_LINE) return fail();

      onLine(partial + text.slice(start, end));
      partial = '';
      start = end + 1;
    }

    partial += text.slice(start);

    if (Buffer.byteLength(partial) > NETWORK_MAX_LINE) fail();
  };
}

class NetworkSocket {
  constructor(options) {
    this.options = options;
    this.key = options.key;
    this.nonce = null;
    this.seq = 0;
    this.serverSeq = 0;
    this.pacer = null;
    this.finished = false;
    this.authenticated = false;
    this.open();
  }

  exit(message) {
    if (this.finished) return;

    this.finished = true;
    clearTimeout(this.timer);
    clearTimeout(this.responseTimer);
    this.pacer?.stop();
    this.socket?.destroy();
    this.options.on.exit(message);
  }

  send(value) {
    if (this.finished || !this.socket?.writable) return;

    if (this.socket.writableLength > MAX_QUEUED) return this.exit('The robot connection stopped responding.');

    this.socket.write(`${JSON.stringify(value)}\n`);
  }

  write(command) {
    if (this.authenticated) this.send(signedCommand(this.key, this.nonce, ++this.seq, command));
  }

  hello(event) {
    if (!this.nonce || !isPairingKey(this.key) || !event.spec)
      return this.exit('The robot sent an incomplete greeting.');

    this.authenticated = true;
    clearTimeout(this.timer);
    this.heard();
    this.pacer = new IntentPacer({ write: (command) => this.write(command) });
    this.options.on.ready(event);
  }

  authenticatedEvent(envelope) {
    const { seq: received, body, mac } = envelope;

    if (received !== this.serverSeq + 1 || typeof body !== 'string' || !/^[a-f0-9]{64}$/.test(mac ?? ''))
      throw new Error('The robot sent an unsigned message.');

    const expected = hmac(this.key, `${this.nonce}:server:${received}:${body}`);

    if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex')))
      throw new Error('The robot sent a damaged signature.');

    this.serverSeq = received;

    return JSON.parse(body);
  }

  receive(line) {
    if (this.finished) return;

    let event;

    try {
      const envelope = JSON.parse(line);

      event = this.nonce ? this.authenticatedEvent(envelope) : envelope;
    } catch {
      return this.exit('The robot sent a damaged message.');
    }

    if (this.authenticated) {
      this.heard();
      this.options.on.line(JSON.stringify(event));

      return;
    }

    if (event?.event === 'hello') return this.hello(event);

    this.challenge(event);
  }

  heard() {
    clearTimeout(this.responseTimer);
    this.responseTimer = setTimeout(() => this.exit('The robot connection stopped responding.'), RESPONSE_MS);
  }

  challenge(event) {
    if (event?.event !== 'challenge' || !/^[a-f0-9]{64}$/.test(event.nonce ?? '') || this.nonce)
      return this.exit('The robot refused the connection.');

    this.nonce = event.nonce;

    if (!isPairingKey(this.key)) return this.exit('Enter the six-digit code shown on the robot.');

    this.send({ cmd: 'authenticate', proof: authenticationProof(this.key, this.nonce) });
  }

  open() {
    this.nonce = null;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.exit('Check the robot’s address and pairing code.'), HANDSHAKE_MS);
    this.socket = (this.options.connect ?? net.createConnection)({
      host: this.options.address,
      port: this.options.port,
    });
    this.socket.setNoDelay(true);
    this.socket.setEncoding('utf8');
    this.socket.on(
      'data',
      lineReader(
        (line) => this.receive(line),
        () => this.exit('The robot sent a message larger than 64 KB.'),
      ),
    );
    this.socket.on('error', () => this.exit('Couldn’t reach the robot. Check its address and pairing code.'));
    this.socket.on('close', () => this.exit(this.authenticated ? null : 'Check the robot’s pairing code.'));
  }

  drive(joints) {
    this.pacer?.drive(joints);
  }

  hold(joints) {
    this.pacer?.hold(joints);
  }

  idle() {
    this.pacer?.idle();
  }

  alive() {
    this.pacer?.alive();
  }

  end() {
    this.pacer?.stop();
    this.socket.end();
  }

  kill() {
    this.exit(null);
  }
}

export const networkSocket = (options) => new NetworkSocket(options);
