import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeName } from '../print/connectors/mdns.mjs';
import { discoverRobots, ROBOT_SERVICE } from './networkDiscovery.mjs';
import { robotDnsRecords } from './networkDns.mjs';

function record(name, type, bytes) {
  const header = Buffer.alloc(10);

  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(1, 2);
  header.writeUInt32BE(120, 4);
  header.writeUInt16BE(bytes.length, 8);

  return Buffer.concat([encodeName(name), header, bytes]);
}

function packet(address = [192, 168, 1, 4], name = 'Pip', family = 'feetech', port = 7447) {
  const service = `${ROBOT_SERVICE}.local`;
  const instance = `${name}.${service}`;
  const host = `${name.toLowerCase().replaceAll('.', '-')}.local`;
  const srv = Buffer.alloc(6);
  const id = (family === 'dynamixel' ? 'b' : 'a').repeat(64);
  const txt = [`family=${family}`, `id=${id}`].map((value) => {
    const bytes = Buffer.from(value);

    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });
  const header = Buffer.alloc(12);

  srv.writeUInt16BE(port, 4);
  header.writeUInt16BE(4, 6);

  return Buffer.concat([
    header,
    record(service, 12, encodeName(instance)),
    record(instance, 33, Buffer.concat([srv, encodeName(host)])),
    record(host, 1, Buffer.from(address)),
    record(instance, 16, Buffer.concat(txt)),
  ]);
}

function discoverySocket(bytes) {
  const socket = new EventEmitter();

  socket.sentInterfaces = [];
  socket.send = vi.fn((_query, _port, _group, complete) => {
    queueMicrotask(() => {
      socket.sentInterfaces.push(socket.selectedInterface);
      complete();
    });
  });
  socket.addMembership = vi.fn();
  socket.setMulticastInterface = vi.fn((address) => {
    socket.selectedInterface = address;
  });
  socket.close = vi.fn();
  socket.bind = vi.fn((_port, ready) => {
    ready();
    queueMicrotask(() => {
      for (const message of Array.isArray(bytes) ? bytes : [bytes, bytes]) socket.emit('message', message);
    });
  });

  return socket;
}

afterEach(() => vi.restoreAllMocks());

describe('robot discovery', () => {
  it('discovers both robot families through shared multicast sockets on private interfaces', async () => {
    const socket = discoverySocket([
      packet([192, 168, 1, 4], 'Pip.2'),
      packet([192, 168, 1, 4], 'Miso', 'dynamixel', 7448),
    ]);
    const socketFactory = vi.spyOn(dgram, 'createSocket').mockReturnValue(socket);
    const addresses = [
      [192, 168, 1, 2],
      [10, 0, 0, 2],
    ].map((octets) => octets.join('.'));

    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      unconfigured: undefined,
      first: [{ address: addresses[0], family: 'IPv4', internal: false }],
      second: [{ address: addresses[1], family: 'IPv4', internal: false }],
    });

    const found = await discoverRobots({ timeoutMs: 5 });

    expect(socketFactory).toHaveBeenCalledWith({ type: 'udp4', reuseAddr: true });
    expect(socket.bind.mock.calls[0][0]).toBe(5353);
    expect(socket.addMembership.mock.calls).toEqual(addresses.map((address) => [[224, 0, 0, 251].join('.'), address]));

    expect(found).toEqual([
      { name: 'Pip.2', host: [192, 168, 1, 4].join('.'), port: 7447, family: 'feetech', id: 'a'.repeat(64) },
      { name: 'Miso', host: [192, 168, 1, 4].join('.'), port: 7448, family: 'dynamixel', id: 'b'.repeat(64) },
    ]);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.send).toHaveBeenCalledTimes(14);
    expect(socket.setMulticastInterface).toHaveBeenCalledTimes(14);
    expect(socket.sentInterfaces).toEqual(Array.from({ length: 7 }, () => addresses).flat());
  });

  it('ignores advertised public destinations and malformed multicast packets', async () => {
    const socket = discoverySocket(packet([8, 8, 8, 8]));

    expect(
      await discoverRobots({
        timeoutMs: 5,
        interfaces: () => [[192, 168, 1, 2].join('.')],
        createSocket: () => socket,
      }),
    ).toEqual([]);

    const valid = packet();

    for (let length = 0; length < valid.length; length++)
      expect(robotDnsRecords(valid.subarray(0, length))).toEqual([]);
  });

  it('caps compression loops, names, record counts and incomplete record bodies', () => {
    const cycle = Buffer.alloc(24);

    cycle.writeUInt16BE(1, 6);
    cycle.writeUInt16BE(0xc00c, 12);
    expect(robotDnsRecords(cycle)).toEqual([]);

    const count = Buffer.alloc(12);

    count.writeUInt16BE(65535, 6);
    expect(robotDnsRecords(count)).toEqual([]);

    const long = Buffer.concat([Buffer.alloc(12), Buffer.from([64]), Buffer.alloc(80)]);

    long.writeUInt16BE(1, 6);
    expect(robotDnsRecords(long)).toEqual([]);
  });

  it('finishes once when socket errors race the discovery timeout', async () => {
    const socket = discoverySocket(packet());

    socket.bind = () => queueMicrotask(() => socket.emit('error', new Error('closed')));
    expect(
      await discoverRobots({
        timeoutMs: 5,
        interfaces: () => [[192, 168, 1, 2].join('.')],
        createSocket: () => socket,
      }),
    ).toEqual([]);
    expect(socket.close).toHaveBeenCalledOnce();
  });
});
