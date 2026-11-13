import crypto from 'node:crypto';

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const OPCODE = { text: 1, binary: 2, close: 8, ping: 9, pong: 10 };
export const CLOSE = { normal: 1000, protocol: 1002, tooBig: 1009 };
export const MAX_PAYLOAD = 512;

const ACCEPTED_OPCODES = new Set([OPCODE.text, OPCODE.close, OPCODE.ping, OPCODE.pong]);

export class FrameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const HANDSHAKE_DIGEST = 'sha1';

export const acceptKey = (secKey) => crypto.hash(HANDSHAKE_DIGEST, secKey + WEBSOCKET_GUID, 'base64');

const protocolError = (message) => new FrameError(CLOSE.protocol, message);

function checkFirstByte(byte) {
  if ((byte & 0x80) === 0) throw protocolError('Fragmented frame');

  if (byte & 0x70) throw protocolError('Reserved bits set');

  if (!ACCEPTED_OPCODES.has(byte & 0x0f)) throw protocolError('Unsupported opcode');
}

function payloadLength(bytes) {
  const short = bytes[1] & 0x7f;

  if (short === 127) throw new FrameError(CLOSE.tooBig, 'Frame too large');

  if (short < 126) return { length: short, header: 2 };

  if ((bytes[0] & 0x08) !== 0) throw protocolError('Control frame too large');

  return bytes.length < 4 ? null : { length: bytes.readUInt16BE(2), header: 4 };
}

export function readFrame(bytes) {
  if (bytes.length < 2) return null;

  checkFirstByte(bytes[0]);

  if ((bytes[1] & 0x80) === 0) throw protocolError('Unmasked frame');

  const size = payloadLength(bytes);

  if (!size) return null;

  if (size.length > MAX_PAYLOAD) throw new FrameError(CLOSE.tooBig, 'Frame too large');

  const start = size.header + 4;
  const end = start + size.length;

  if (bytes.length < end) return null;

  const mask = bytes.subarray(size.header, start);
  const payload = Buffer.from(bytes.subarray(start, end));

  for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

  return { opcode: bytes[0] & 0x0f, payload, size: end };
}

export function readFrames(bytes) {
  const frames = [];
  let rest = bytes;

  for (let frame = readFrame(rest); frame; frame = readFrame(rest)) {
    frames.push(frame);
    rest = rest.subarray(frame.size);
  }

  return { frames, rest };
}

function lengthHeader(length, maskBit) {
  if (length < 126) return Buffer.from([maskBit | length]);

  if (length < 0x10000) {
    const header = Buffer.from([maskBit | 126, 0, 0]);

    header.writeUInt16BE(length, 1);

    return header;
  }

  const header = Buffer.alloc(9);

  header[0] = maskBit | 127;
  header.writeBigUInt64BE(BigInt(length), 1);

  return header;
}

const bytesOf = (payload) => (typeof payload === 'string' ? Buffer.from(payload, 'utf8') : Buffer.from(payload));

export function serverFrame(opcode, payload = Buffer.alloc(0)) {
  const body = bytesOf(payload);

  return Buffer.concat([Buffer.from([0x80 | opcode]), lengthHeader(body.length, 0), body]);
}

export function closeFrame(code) {
  const body = Buffer.alloc(2);

  body.writeUInt16BE(code, 0);

  return serverFrame(OPCODE.close, body);
}

export const pongFrame = (payload) => serverFrame(OPCODE.pong, payload);

export function maskedFrame(opcode, payload = Buffer.alloc(0)) {
  const body = bytesOf(payload);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.from(body);

  for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i % 4];

  return Buffer.concat([Buffer.from([0x80 | opcode]), lengthHeader(body.length, 0x80), mask, masked]);
}
