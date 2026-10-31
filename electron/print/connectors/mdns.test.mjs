import { describe, expect, it } from 'vitest';
import { decodeName, decodeRecords, encodeName, encodeQuery, servicesFrom } from './mdns.mjs';

const PRINTER_IP = [192, 168, 1, 40];

function record(name, type, data) {
  const head = Buffer.alloc(10);

  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(1, 2);
  head.writeUInt32BE(120, 4);
  head.writeUInt16BE(data.length, 8);

  return Buffer.concat([encodeName(name), head, data]);
}

function srv(port, target) {
  const head = Buffer.alloc(6);

  head.writeUInt16BE(port, 4);

  return Buffer.concat([head, encodeName(target)]);
}

function response(records) {
  const header = Buffer.alloc(12);

  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(1, 6);
  header.writeUInt16BE(records.length - 1, 10);

  return Buffer.concat([header, ...records]);
}

describe('mDNS', () => {
  it('asks for a service type', () => {
    const query = encodeQuery('_octoprint._tcp.local', 12);

    expect(query.readUInt16BE(4)).toBe(1);
    expect(decodeName(query, 12).name).toBe('_octoprint._tcp.local');
  });

  it('follows compression pointers', () => {
    const buf = Buffer.concat([
      Buffer.alloc(12),
      encodeName('octopi.local'),
      Buffer.from([0x05, 0x5f, 0x68, 0x74, 0x74, 0x70, 0xc0, 12]),
    ]);
    const start = 12 + encodeName('octopi.local').length;

    expect(decodeName(buf, start)).toEqual({ name: '_http.octopi.local', end: start + 8 });
  });

  it('turns an answer into a printer', () => {
    const message = response([
      record('_octoprint._tcp.local', 12, encodeName('OctoPrint on octopi._octoprint._tcp.local')),
      record('OctoPrint on octopi._octoprint._tcp.local', 33, srv(80, 'octopi.local')),
      record('octopi.local', 1, Buffer.from(PRINTER_IP)),
    ]);
    const records = decodeRecords(message);

    expect(servicesFrom(records, '_octoprint._tcp', 'octoprint')).toEqual([
      { name: 'OctoPrint on octopi', host: PRINTER_IP.join('.'), port: 80, kind: 'octoprint' },
    ]);
  });

  it('ignores a truncated packet', () => {
    expect(decodeRecords(Buffer.alloc(4))).toEqual([]);
  });
});
