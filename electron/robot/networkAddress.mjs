import dns from 'node:dns/promises';
import net from 'node:net';
import { isPairingKey } from './networkIdentity.mjs';

export const ROBOT_PORT = 7447;

const lan = new net.BlockList();
const V4 = [
  [[10, 0, 0, 0], 8],
  [[172, 16, 0, 0], 12],
  [[192, 168, 0, 0], 16],
  [[169, 254, 0, 0], 16],
  [[127, 0, 0, 0], 8],
];
const V6 = [
  [['fc00', '', ''], 7],
  [['fe80', '', ''], 10],
  [['', '', '1'], 128],
];

for (const [octets, prefix] of V4) lan.addSubnet(octets.join('.'), prefix, 'ipv4');

for (const [groups, prefix] of V6) lan.addSubnet(groups.join(':'), prefix, 'ipv6');

export function isRobotAddress(address) {
  if (net.isIPv4(address)) return lan.check(address, 'ipv4');

  return net.isIPv6(address) && !address.includes('%') && lan.check(address, 'ipv6');
}

const validPort = (port) => Number.isInteger(port) && port >= 1 && port <= 65535;
const validIdentity = (id) => id === undefined || isPairingKey(id);
const validCode = (code) => code === undefined || (typeof code === 'string' && /^\d{6}$/.test(code));

export function checkedEndpoint(ask) {
  if (!ask || Object.getPrototypeOf(ask) !== Object.prototype) return null;

  const keys = Object.keys(ask);
  const host = typeof ask.host === 'string' ? ask.host.toLowerCase() : '';
  const port = ask.port ?? ROBOT_PORT;
  const named = host.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host);
  const code = ask.code;

  if (keys.some((key) => !['host', 'port', 'code', 'id'].includes(key))) return null;

  if (!host || (!net.isIP(host) && !named) || !validPort(port)) return null;

  if (!validCode(code) || !validIdentity(ask.id)) return null;

  return { host, port, ...(code === undefined ? {} : { code }), ...(ask.id === undefined ? {} : { id: ask.id }) };
}

export async function resolveRobotHost(host, lookup = dns.lookup) {
  let addresses;

  try {
    addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  } catch {
    throw new Error('Check the robot’s local address.');
  }

  if (!addresses.length || !addresses.every(({ address }) => isRobotAddress(address)))
    throw new Error('Use a robot address on your local network.');

  return addresses[0].address;
}
