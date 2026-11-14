import dgram from 'node:dgram';
import os from 'node:os';
import { encodeQuery } from '../print/connectors/mdns.mjs';
import { robotDnsRecords } from './networkDns.mjs';
import { isRobotAddress } from './networkAddress.mjs';

export const ROBOT_SERVICE = '_basecase-robot._tcp';

const MAX_RECORDS = 512;
const MULTICAST = [224, 0, 0, 251].join('.');
const PORT = 5353;

export function robotServices(records) {
  const suffix = `.${ROBOT_SERVICE}.local`;
  const services = new Map(records.filter((record) => record.type === 33).map((record) => [record.name, record]));
  const ips = new Map(records.filter((record) => record.type === 1).map((record) => [record.name, record.address]));

  return records
    .filter(
      (record) =>
        record.type === 12 && record.name === suffix.slice(1) && record.target?.toLowerCase().endsWith(suffix),
    )
    .map((record) => ({
      name: record.target.slice(0, -suffix.length),
      service: services.get(record.target.toLowerCase()),
    }))
    .filter(({ service }) => service)
    .map(({ name, service }) => ({ name, host: ips.get(service.target?.toLowerCase()), port: service.port }))
    .filter(
      ({ host, port }) =>
        typeof host === 'string' && isRobotAddress(host) && Number.isInteger(port) && port > 0 && port <= 65535,
    )
    .map(({ name, host, port }) => {
      const properties = records.find(
        (record) => record.type === 16 && record.name === `${name}${suffix}`.toLowerCase(),
      );
      const family = properties?.family;
      const id = properties?.id;

      return { name: name.slice(0, 80), host, port, ...(family ? { family } : {}), ...(id ? { id } : {}) };
    });
}

function joinInterface(socket, address) {
  try {
    socket.addMembership(MULTICAST, address);

    return true;
  } catch {
    return false;
  }
}

class MulticastQueries {
  constructor(socket) {
    this.socket = socket;
    this.pending = [];
    this.active = false;
    this.closed = false;
  }

  send(addresses, query) {
    if (this.closed) return;

    this.pending.push(...addresses.map((address) => ({ address, query })));
    this.next();
  }

  next() {
    if (this.active || this.closed) return;

    const packet = this.pending.shift();

    if (!packet) return;

    this.active = true;

    const complete = () => {
      this.active = false;
      this.next();
    };

    try {
      this.socket.setMulticastInterface(packet.address);
      this.socket.send(packet.query, PORT, MULTICAST, complete);
    } catch {
      complete();
    }
  }

  close() {
    this.closed = true;
    this.pending = [];
  }
}

const privateInterfaces = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry?.family === 'IPv4' && !entry.internal && isRobotAddress(entry.address))
    .map((entry) => entry.address);

export function discoverRobots({
  timeoutMs = 1500,
  interfaces = privateInterfaces,
  createSocket = () => dgram.createSocket({ type: 'udp4', reuseAddr: true }),
} = {}) {
  return new Promise((resolve) => {
    const socket = createSocket();
    const queries = new MulticastQueries(socket);
    const records = [];
    let addresses = interfaces();
    const asked = new Set();
    let finished = false;
    const timer = setTimeout(() => finish(), timeoutMs);
    const finish = () => {
      if (finished) return;

      finished = true;
      clearTimeout(timer);
      queries.close();

      try {
        socket.close();
      } catch {}

      resolve([
        ...new Map(robotServices(records).map((entry) => [entry.id ?? `${entry.host}:${entry.port}`, entry])).values(),
      ]);
    };
    const ask = (name, type) => {
      const id = `${name}:${type}`;

      if (asked.has(id) || asked.size >= MAX_RECORDS) return;

      asked.add(id);

      queries.send(addresses, encodeQuery(name, type));
    };

    socket.on('error', finish);
    socket.on('message', (message) => {
      if (records.length >= MAX_RECORDS || message.length > 65535) return;

      try {
        records.push(...robotDnsRecords(message).slice(0, MAX_RECORDS - records.length));
      } catch {
        return;
      }

      for (const record of records.filter((entry) => entry.type === 12 && entry.target)) {
        ask(record.target, 33);
        ask(record.target, 16);
      }

      for (const record of records.filter((entry) => entry.type === 33 && entry.target)) ask(record.target, 1);
    });
    socket.bind(PORT, () => {
      addresses = addresses.filter((address) => joinInterface(socket, address));

      if (!addresses.length) return finish();

      ask(`${ROBOT_SERVICE}.local`, 12);
    });
  });
}
