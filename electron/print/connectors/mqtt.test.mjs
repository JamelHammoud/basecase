import { once } from 'node:events';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PACKET,
  connectMqtt,
  decodeLength,
  decodePublish,
  encodeConnect,
  encodeLength,
  encodePublish,
  encodeSubscribe,
  splitPackets,
} from './mqtt.mjs';

let server;

afterEach(() => server?.close());

describe('MQTT codec', () => {
  it('round-trips remaining lengths across byte boundaries', () => {
    const cases = [
      [0, [0x00]],
      [127, [0x7f]],
      [128, [0x80, 0x01]],
      [16383, [0xff, 0x7f]],
      [16384, [0x80, 0x80, 0x01]],
      [2097151, [0xff, 0xff, 0x7f]],
      [2097152, [0x80, 0x80, 0x80, 0x01]],
    ];

    for (const [length, bytes] of cases) {
      expect([...encodeLength(length)]).toEqual(bytes);
      expect(decodeLength(Buffer.from([0x30, ...bytes]), 1)).toEqual({ value: length, bytes: bytes.length });
    }

    expect(decodeLength(Buffer.from([0x30, 0x80]), 1)).toBeNull();
    expect(() => encodeLength(268435456)).toThrow();
  });

  it('encodes CONNECT with the login and a clean session', () => {
    const connect = encodeConnect({ clientId: 'id', username: 'bblp', password: '1234', keepalive: 30 });

    expect(connect[0]).toBe(PACKET.CONNECT << 4);
    expect(connect[1]).toBe(connect.length - 2);
    expect(connect.subarray(2, 8).toString('latin1')).toBe('\0\x04MQTT');
    expect(connect[8]).toBe(4);
    expect(connect[9]).toBe(0xc2);
    expect(connect.readUInt16BE(10)).toBe(30);
    expect(connect.subarray(12).toString('latin1')).toBe('\0\x02id\0\x04bblp\0\x041234');
  });

  it('encodes SUBSCRIBE at QoS 0 and PUBLISH with a long payload', () => {
    const subscribe = encodeSubscribe(7, 'device/X/report');

    expect(subscribe[0]).toBe(0x82);
    expect(subscribe.readUInt16BE(2)).toBe(7);
    expect(subscribe.at(-1)).toBe(0);

    const payload = 'x'.repeat(300);
    const publish = encodePublish('t/1', payload);
    const { packets, rest } = splitPackets(publish);

    expect(publish.subarray(1, 3)).toEqual(Buffer.from([0xb1, 0x02]));
    expect(rest).toHaveLength(0);
    expect(decodePublish(packets[0]).topic).toBe('t/1');
    expect(decodePublish(packets[0]).payload.toString()).toBe(payload);
  });

  it('parses coalesced frames and keeps a split frame for later', () => {
    const first = encodePublish('a', '{"n":1}');
    const second = encodePublish('b', 'y'.repeat(200));
    const joined = Buffer.concat([first, second]);
    const head = splitPackets(joined.subarray(0, first.length + 2));

    expect(head.packets.map((item) => decodePublish(item).topic)).toEqual(['a']);
    expect(head.rest).toHaveLength(2);

    const tail = splitPackets(Buffer.concat([head.rest, joined.subarray(first.length + 2)]));

    expect(tail.packets.map((item) => decodePublish(item).topic)).toEqual(['b']);
    expect(tail.rest).toHaveLength(0);
    expect(splitPackets(Buffer.from([0x30])).packets).toEqual([]);
  });
});

async function broker(returnCode) {
  server = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.once('data', () => {
      socket.write(Buffer.from([0x20, 2, 0, returnCode]));
      socket.write(Buffer.concat([encodePublish('a', 'one'), encodePublish('b', 'two')]));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return server.address().port;
}

describe('MQTT client', () => {
  it('connects and delivers messages that arrive in one chunk', async () => {
    const port = await broker(0);
    const client = await connectMqtt({ host: '127.0.0.1', port, connect: net.connect, clientId: 'c', password: 'p' });
    const topics = [];

    client.on('message', (topic) => topics.push(topic));
    await new Promise((resolve) => setTimeout(resolve, 50));
    client.close();

    expect(topics).toEqual(['a', 'b']);
  });

  it('reports a refused login with its return code', async () => {
    const port = await broker(5);
    const login = connectMqtt({ host: '127.0.0.1', port, connect: net.connect, clientId: 'c', password: 'bad' });

    await expect(login).rejects.toMatchObject({ reason: 'refused', returnCode: 5 });
  });

  it('reports an unreachable broker', async () => {
    const closed = net.createServer();

    closed.listen(0, '127.0.0.1');
    await once(closed, 'listening');

    const { port } = closed.address();

    closed.close();

    const login = connectMqtt({ host: '127.0.0.1', port, connect: net.connect, clientId: 'c', timeoutMs: 2000 });

    await expect(login).rejects.toMatchObject({ reason: 'unreachable' });
  });
});
