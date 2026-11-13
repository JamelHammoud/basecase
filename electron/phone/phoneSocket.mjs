import { checkedPhoneMessage, RateCap } from './phoneMessage.mjs';
import { CLOSE, closeFrame, FrameError, OPCODE, pongFrame, readFrames } from './wsFrames.mjs';

const MAX_BUFFERED = 4096;
const CLOSE_GRACE_MS = 1000;

export class PhoneSocket {
  #socket;
  #onInput;
  #onEnd;
  #buffered;
  #cap = new RateCap();
  #ended = false;
  #closed = false;

  constructor({ socket, head, onInput, onEnd }) {
    this.#socket = socket;
    this.#onInput = onInput;
    this.#onEnd = onEnd;
    this.#buffered = Buffer.from(head ?? Buffer.alloc(0));
    socket.setNoDelay?.(true);
    socket.on('data', (chunk) => this.#receive(chunk));
    socket.on('end', () => this.#finish(CLOSE.normal));
    socket.on('close', () => this.#finish(CLOSE.normal));
    socket.on('error', () => this.#finish(CLOSE.normal));

    if (this.#buffered.length > 0) queueMicrotask(() => this.#receive(Buffer.alloc(0)));
  }

  get remote() {
    return `${this.#socket.remoteAddress}:${this.#socket.remotePort}`;
  }

  close(code = CLOSE.normal) {
    if (this.#closed) return;

    this.#closed = true;
    this.#ended = true;

    if (this.#socket.destroyed) return;

    this.#socket.end(closeFrame(code));
    setTimeout(() => this.#socket.destroy(), CLOSE_GRACE_MS).unref();
  }

  #finish(code) {
    if (this.#ended) return;

    this.close(code);
    this.#onEnd(code);
  }

  #receive(chunk) {
    if (this.#ended) return;

    this.#buffered = Buffer.concat([this.#buffered, chunk]);

    try {
      const { frames, rest } = readFrames(this.#buffered);

      this.#buffered = Buffer.from(rest);
      frames.forEach((frame) => this.#handle(frame));
    } catch (err) {
      this.#finish(err instanceof FrameError ? err.code : CLOSE.protocol);

      return;
    }

    if (this.#buffered.length > MAX_BUFFERED) this.#finish(CLOSE.tooBig);
  }

  #handle({ opcode, payload }) {
    if (this.#ended) return;

    if (opcode === OPCODE.close) {
      this.#finish(CLOSE.normal);

      return;
    }

    if (opcode === OPCODE.ping) this.#socket.write(pongFrame(payload));

    if (opcode !== OPCODE.text) return;

    const message = checkedPhoneMessage(payload.toString('utf8'));

    if (message && this.#cap.allow()) this.#onInput(message);
  }
}
