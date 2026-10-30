import { EventEmitter } from 'node:events';
import tls from 'node:tls';

export const PACKET = {
  CONNECT: 1,
  CONNACK: 2,
  PUBLISH: 3,
  SUBSCRIBE: 8,
  SUBACK: 9,
  PINGREQ: 12,
  PINGRESP: 13,
  DISCONNECT: 14,
};

const PINGREQ = Buffer.from([PACKET.PINGREQ << 4, 0]);
const DISCONNECT = Buffer.from([PACKET.DISCONNECT << 4, 0]);
const MAX_LENGTH = 268435455;

export class MqttError extends Error {
  constructor(reason, returnCode) {
    super(returnCode === undefined ? `MQTT ${reason}` : `MQTT ${reason} (${returnCode})`);
    this.reason = reason;
    this.returnCode = returnCode;
  }
}

export function encodeLength(length) {
  if (length < 0 || length > MAX_LENGTH) throw new RangeError(`MQTT packet too long: ${length}`);

  const bytes = [];
  let rest = length;

  do {
    const low = rest % 128;

    rest = Math.floor(rest / 128);
    bytes.push(rest > 0 ? low | 0x80 : low);
  } while (rest > 0);

  return Buffer.from(bytes);
}

export function decodeLength(buffer, offset) {
  let value = 0;
  let multiplier = 1;

  for (let index = 0; index < 4; index++) {
    if (offset + index >= buffer.length) return null;

    const byte = buffer[offset + index];

    value += (byte & 0x7f) * multiplier;

    if ((byte & 0x80) === 0) return { value, bytes: index + 1 };

    multiplier *= 128;
  }

  throw new MqttError('malformed');
}

function uint16(value) {
  const buffer = Buffer.alloc(2);

  buffer.writeUInt16BE(value);

  return buffer;
}

function utf8(text) {
  const data = Buffer.from(String(text), 'utf8');

  return Buffer.concat([uint16(data.length), data]);
}

function packet(type, flags, body) {
  return Buffer.concat([Buffer.from([(type << 4) | flags]), encodeLength(body.length), body]);
}

export function encodeConnect({ clientId, username, password, keepalive = 30 }) {
  const hasUser = username !== undefined && username !== null;
  const hasPassword = password !== undefined && password !== null;
  const flags = 0x02 | (hasUser ? 0x80 : 0) | (hasPassword ? 0x40 : 0);
  const header = Buffer.concat([utf8('MQTT'), Buffer.from([4, flags]), uint16(keepalive)]);
  const payload = [utf8(clientId)];

  if (hasUser) payload.push(utf8(username));

  if (hasPassword) payload.push(utf8(password));

  return packet(PACKET.CONNECT, 0, Buffer.concat([header, ...payload]));
}

export function encodeSubscribe(packetId, topic) {
  return packet(PACKET.SUBSCRIBE, 0x02, Buffer.concat([uint16(packetId), utf8(topic), Buffer.from([0])]));
}

export function encodePublish(topic, payload) {
  return packet(PACKET.PUBLISH, 0, Buffer.concat([utf8(topic), Buffer.from(payload)]));
}

export function splitPackets(buffer) {
  const packets = [];
  let offset = 0;

  while (offset < buffer.length) {
    const length = decodeLength(buffer, offset + 1);
    const start = length ? offset + 1 + length.bytes : Infinity;
    const end = length ? start + length.value : Infinity;

    if (end > buffer.length) break;

    packets.push({ type: buffer[offset] >> 4, flags: buffer[offset] & 0x0f, body: buffer.subarray(start, end) });
    offset = end;
  }

  return { packets, rest: buffer.subarray(offset) };
}

export function decodePublish({ flags, body }) {
  const topicLength = body.readUInt16BE(0);
  const topic = body.toString('utf8', 2, 2 + topicLength);
  const qos = (flags >> 1) & 0x03;
  const payloadStart = 2 + topicLength + (qos > 0 ? 2 : 0);

  return { topic, payload: body.subarray(payloadStart), qos };
}

export class MqttClient extends EventEmitter {
  constructor(socket, { keepalive = 30 } = {}) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.nextPacketId = 1;
    this.closed = false;
    this.held = [];
    this.pinger = setInterval(() => this.write(PINGREQ), keepalive * 500);
    this.pinger.unref?.();
    this.on('newListener', (event) => event === 'message' && queueMicrotask(() => this.release()));
    socket.on('data', (chunk) => this.receive(chunk));
    socket.on('error', (error) => this.finish(error));
    socket.on('close', () => this.finish());
  }

  receive(chunk) {
    const { packets, rest } = splitPackets(Buffer.concat([this.buffer, chunk]));

    this.buffer = Buffer.from(rest);

    for (const item of packets) this.dispatch(item);
  }

  dispatch(item) {
    if (item.type === PACKET.CONNACK) {
      this.emit('connack', item.body[1]);

      return;
    }

    if (item.type !== PACKET.PUBLISH) return;

    const { topic, payload } = decodePublish(item);

    if (this.listenerCount('message') === 0) this.held.push([topic, payload]);
    else this.emit('message', topic, payload);
  }

  release() {
    for (const [topic, payload] of this.held.splice(0)) this.emit('message', topic, payload);
  }

  write(data) {
    if (!this.closed && this.socket.writable) this.socket.write(data);
  }

  subscribe(topic) {
    const id = this.nextPacketId;

    this.nextPacketId = (id % 65535) + 1;
    this.write(encodeSubscribe(id, topic));
  }

  publish(topic, payload) {
    this.write(encodePublish(topic, payload));
  }

  finish(error) {
    if (this.closed) return;

    this.closed = true;
    clearInterval(this.pinger);
    this.socket.destroy();
    this.emit('close', error);
  }

  close() {
    this.write(DISCONNECT);
    this.finish();
  }
}

export function connectMqtt({ host, port = 8883, timeoutMs = 8000, connect = tls.connect, ...login }) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, rejectUnauthorized: false });
    const client = new MqttClient(socket, login);
    const settle = (error) => {
      clearTimeout(timer);
      client.off('close', onClose);

      if (!error) {
        resolve(client);

        return;
      }

      client.finish();
      reject(error);
    };
    const onClose = (error) => settle(new MqttError(error ? 'unreachable' : 'closed'));
    const timer = setTimeout(() => settle(new MqttError('timeout')), timeoutMs);

    client.on('close', onClose);
    client.once('connack', (code) => settle(code === 0 ? undefined : new MqttError('refused', code)));
    socket.write(encodeConnect(login));
  });
}
