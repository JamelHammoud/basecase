import dgram from 'node:dgram';

const MDNS_ADDRESS = [224, 0, 0, 251].join('.');
const MDNS_PORT = 5353;
const TYPE = { A: 1, PTR: 12, SRV: 33 };
const CLASS_IN = 1;
const MAX_JUMPS = 16;

export function encodeName(name) {
  const labels = name.replace(/\.$/, '').split('.');
  const parts = labels.map((label) => {
    const bytes = Buffer.from(label, 'utf8');

    return Buffer.concat([Buffer.from([bytes.length]), bytes]);
  });

  return Buffer.concat([...parts, Buffer.from([0])]);
}

export function encodeQuery(name, type) {
  const header = Buffer.alloc(12);

  header.writeUInt16BE(1, 4);

  const tail = Buffer.alloc(4);

  tail.writeUInt16BE(type, 0);
  tail.writeUInt16BE(CLASS_IN, 2);

  return Buffer.concat([header, encodeName(name), tail]);
}

function readLabel(buf, at, labels) {
  const len = buf[at];

  labels.push(buf.toString('utf8', at + 1, at + 1 + len));

  return at + 1 + len;
}

export function decodeName(buf, offset) {
  const labels = [];
  let at = offset;
  let end = null;
  let jumps = 0;

  while (at < buf.length && buf[at] !== 0 && jumps <= MAX_JUMPS) {
    const pointer = (buf[at] & 0xc0) === 0xc0;

    if (pointer && end === null) end = at + 2;

    if (pointer) jumps += 1;

    at = pointer ? buf.readUInt16BE(at) & 0x3fff : readLabel(buf, at, labels);
  }

  return { name: labels.join('.'), end: end ?? at + 1 };
}

function rdataOf(buf, type, at) {
  if (type === TYPE.PTR) return { target: decodeName(buf, at).name };

  if (type === TYPE.SRV) return { port: buf.readUInt16BE(at + 4), target: decodeName(buf, at + 6).name };

  if (type === TYPE.A) return { address: Array.from(buf.subarray(at, at + 4)).join('.') };

  return null;
}

function skipQuestions(buf, count) {
  let at = 12;

  for (let i = 0; i < count; i++) at = decodeName(buf, at).end + 4;

  return at;
}

export function decodeRecords(buf) {
  if (buf.length < 12) return [];

  const records = [];
  const total = buf.readUInt16BE(6) + buf.readUInt16BE(8) + buf.readUInt16BE(10);
  let at = skipQuestions(buf, buf.readUInt16BE(4));

  for (let i = 0; i < total && at + 10 <= buf.length; i++) {
    const { name, end } = decodeName(buf, at);
    const type = buf.readUInt16BE(end);
    const length = buf.readUInt16BE(end + 8);
    const data = rdataOf(buf, type, end + 10);

    if (data) records.push({ name: name.toLowerCase(), type, ...data });

    at = end + 10 + length;
  }

  return records;
}

const lower = (s) => s.toLowerCase();

export function servicesFrom(records, type, kind) {
  const srv = new Map(records.filter((r) => r.type === TYPE.SRV).map((r) => [r.name, r]));
  const ips = new Map(records.filter((r) => r.type === TYPE.A).map((r) => [r.name, r.address]));

  return records
    .filter((r) => r.type === TYPE.PTR && r.name === lower(`${type}.local`))
    .map((r) => ({ instance: r.target, service: srv.get(lower(r.target)) }))
    .filter(({ service }) => service)
    .map(({ instance, service }) => ({
      name: instance.split('.')[0],
      host: ips.get(lower(service.target)) ?? service.target,
      port: service.port,
      kind,
    }));
}

function missing(records) {
  const srv = records.filter((r) => r.type === TYPE.SRV);
  const named = new Set(srv.map((r) => r.name));
  const resolved = new Set(records.filter((r) => r.type === TYPE.A).map((r) => r.name));
  const instances = records.filter((r) => r.type === TYPE.PTR && !named.has(lower(r.target)));

  return [
    ...instances.map((r) => [r.target, TYPE.SRV]),
    ...srv.filter((r) => !resolved.has(lower(r.target))).map((r) => [r.target, TYPE.A]),
  ];
}

export function queryMdns({ types, timeoutMs, createSocket = () => dgram.createSocket({ type: 'udp4' }) }) {
  return new Promise((resolve) => {
    const socket = createSocket();
    const records = [];
    const asked = new Set();
    const ask = (name, type) => {
      const key = `${type}:${lower(name)}`;

      if (asked.has(key)) return;

      asked.add(key);
      socket.send(encodeQuery(name, type), MDNS_PORT, MDNS_ADDRESS, () => {});
    };
    const finish = () => {
      socket.close();
      resolve(records);
    };

    socket.on('error', finish);
    socket.on('message', (msg) => {
      records.push(...decodeRecords(msg));
      missing(records).forEach(([name, type]) => ask(name, type));
    });
    socket.bind(0, () => types.forEach((type) => ask(`${type}.local`, TYPE.PTR)));
    setTimeout(finish, timeoutMs);
  });
}
