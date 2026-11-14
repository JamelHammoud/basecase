import { isPairingKey } from './networkIdentity.mjs';

const MAX_RECORDS = 256;
const MAX_NAME = 253;
const MAX_POINTERS = 16;
const FAMILIES = ['feetech', 'dynamixel', 'unitree-g1', 'ros2'];

function pointerAt(bytes, at, jumps) {
  if (jumps > MAX_POINTERS || at + 2 > bytes.length) throw new Error('DNS pointer bounds');

  return bytes.readUInt16BE(at) & 0x3fff;
}

function dnsName(bytes, offset) {
  const labels = [];
  let at = offset;
  let end = null;
  let jumps = 0;
  let size = 0;

  while (at < bytes.length) {
    const length = bytes[at];

    if (length === 0) return { name: labels.join('.'), end: end ?? at + 1 };

    if ((length & 0xc0) === 0xc0) {
      end ??= at + 2;
      at = pointerAt(bytes, at, ++jumps);

      continue;
    }

    size += length + 1;

    if (length > 63 || size > MAX_NAME || at + 1 + length > bytes.length) throw new Error('DNS name bounds');

    labels.push(bytes.toString('utf8', at + 1, at + 1 + length));
    at += length + 1;
  }

  throw new Error('DNS name ended early');
}

function propertiesFrom(bytes) {
  let at = 0;
  const properties = {};

  while (at < bytes.length) {
    const length = bytes[at++];

    if (at + length > bytes.length) return {};

    const value = bytes.toString('utf8', at, at + length);
    const family = value.startsWith('family=') ? value.slice(7) : null;

    if (FAMILIES.includes(family)) properties.family = family;

    if (value.startsWith('id=') && isPairingKey(value.slice(3))) properties.id = value.slice(3);

    at += length;
  }

  return properties;
}

function targetName(bytes, at, end) {
  const target = dnsName(bytes, at);

  if (target.end > end) throw new Error('DNS target ended early');

  return target.name;
}

function dnsRecord(bytes, at) {
  const { name, end } = dnsName(bytes, at);

  if (end + 10 > bytes.length) throw new Error('DNS record ended early');

  const type = bytes.readUInt16BE(end);
  const length = bytes.readUInt16BE(end + 8);
  const start = end + 10;
  const next = start + length;
  const record = { name: name.toLowerCase(), type };

  if (next > bytes.length) throw new Error('DNS data ended early');

  if (type === 1 && length === 4) record.address = [...bytes.subarray(start, next)].join('.');

  if (type === 12 || (type === 33 && length >= 7)) {
    record.target = targetName(bytes, start + (type === 33 ? 6 : 0), next);
  }

  if (type === 33 && length >= 7) record.port = bytes.readUInt16BE(start + 4);

  if (type === 16) Object.assign(record, propertiesFrom(bytes.subarray(start, next)));

  return { record, next };
}

export function robotDnsRecords(bytes) {
  if (bytes.length < 12 || bytes.length > 65535) return [];

  const questions = bytes.readUInt16BE(4);
  const count = bytes.readUInt16BE(6) + bytes.readUInt16BE(8) + bytes.readUInt16BE(10);

  if (questions > 32 || count > MAX_RECORDS) return [];

  let at = 12;
  const records = [];

  try {
    for (let index = 0; index < questions; index++) at = dnsName(bytes, at).end + 4;

    for (let index = 0; index < count; index++) {
      const parsed = dnsRecord(bytes, at);

      records.push(parsed.record);
      at = parsed.next;
    }
  } catch {
    return [];
  }

  return records;
}
