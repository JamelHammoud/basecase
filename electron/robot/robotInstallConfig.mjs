import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { randomInt } from 'node:crypto';
import { installationSpec } from './robotInstallSpec.mjs';

const KEYS = new Set(['target', 'jointMap', 'emulated', 'key', 'port', 'pairingCode', 'spec']);
const plain = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const failure = (message) => {
  throw new Error(message);
};

const privateAddresses = new net.BlockList();

privateAddresses.addSubnet([10, 0, 0, 0].join('.'), 8);
privateAddresses.addSubnet([172, 16, 0, 0].join('.'), 12);
privateAddresses.addSubnet([192, 168, 0, 0].join('.'), 16);
privateAddresses.addSubnet(['fc00', '', ''].join(':'), 7, 'ipv6');

export function isRobotComputerAddress(address) {
  const family = net.isIP(address);

  return family !== 0 && privateAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

function targetOf(value) {
  if (typeof value !== 'string' || value.length > 320) return failure('Enter the SSH target as user@host.');

  const matched = /^([a-z_][a-z0-9_-]{0,31})@([a-z0-9][a-z0-9.-]{0,252}|\[[a-f0-9:]+\])$/i.exec(value);

  if (!matched) return failure('Enter the SSH target as user@host.');

  const [, user, rawHost] = matched;
  const host = rawHost.replace(/^\[|\]$/g, '');

  if (host.includes('..') || host.endsWith('-') || host.endsWith('.'))
    return failure('Enter the robot computer’s host name.');

  return { user, host };
}

function keyOf(key) {
  if (key === undefined) return null;

  if (typeof key !== 'string' || !path.isAbsolute(key) || /[\0\r\n]/.test(key))
    return failure('Choose an SSH private key file.');

  const stat = fs.statSync(key, { throwIfNoEntry: false });

  if (!stat?.isFile() || stat.size > 1024 * 1024) return failure('Choose an SSH private key file.');

  return key;
}

const validId = (id) => Number.isInteger(id) && id >= 1 && id <= 253;
const TAU = Math.fround(2 * Math.PI);
const MAX_RANGE = Math.fround(Math.fround(2 * Math.PI) * Math.fround(0.95));

function encoderCount(angle, joint) {
  const signed = Math.fround(joint.direction * angle);
  const turns = Math.fround(Math.fround(signed * 4096) / TAU);
  const counts = Math.fround(joint.zero_counts + turns);

  return Math.sign(counts) * Math.floor(Math.abs(counts) + 0.5);
}

function validCalibrationRange(joint) {
  const { min_rad: minimum, max_rad: maximum } = joint;
  const lo = Math.fround(minimum);
  const hi = Math.fround(maximum);
  const counts = [encoderCount(lo, joint), encoderCount(hi, joint)];

  return (
    finite(minimum) &&
    finite(maximum) &&
    Number.isFinite(lo) &&
    Number.isFinite(hi) &&
    lo < hi &&
    Math.fround(hi - lo) <= MAX_RANGE &&
    counts.every((count) => count >= 0 && count <= 4095)
  );
}

const hasControlCharacter = (text) =>
  Array.from(text).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

function robotName(map) {
  const name = map.robot;

  if (typeof name !== 'string' || !name.trim() || Buffer.byteLength(name) > 63 || hasControlCharacter(name))
    return failure('Give the robot a name under 64 bytes.');

  return name;
}

function calibrationJoint(joint) {
  if (!plain(joint) || !validId(joint.id)) return failure('Each joint needs a servo ID from 1 to 253.');

  const { id, name, zero_counts, direction, min_rad, max_rad } = joint;
  const counts = Number.isInteger(zero_counts) && zero_counts >= 0 && zero_counts <= 4095;
  const range = validCalibrationRange(joint);

  if (
    typeof name !== 'string' ||
    name.length < 1 ||
    name.length > 128 ||
    !counts ||
    ![1, -1].includes(direction) ||
    !range ||
    joint.type === 'prismatic'
  )
    return failure('Each rotary joint needs a name, zero, direction and range in radians.');

  return { id, name, zero_counts, direction, min_rad, max_rad };
}

function mapOf(map) {
  if (
    !plain(map) ||
    !['arm', 'legged'].includes(map.class) ||
    !Array.isArray(map.joints) ||
    map.joints.length < 1 ||
    map.joints.length > 32
  )
    return failure('Choose a Robot Package with 1 to 32 servo joints.');

  const joints = map.joints.map(calibrationJoint);

  if (new Set(joints.map((joint) => joint.id)).size !== joints.length)
    return failure('Choose one servo family with a separate ID for each joint.');

  return { class: map.class, joints };
}

export function checkedRobotInstall(request) {
  if (!plain(request) || Object.keys(request).some((key) => !KEYS.has(key)))
    return failure('Give the robot computer’s SSH target and Robot Package.');

  if (request.emulated !== true) return failure('Real motors are locked in this build. Choose an emulated robot.');

  const port = request.port ?? 7447;
  const pairingCode = request.pairingCode ?? String(randomInt(100000, 1000000));

  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    typeof pairingCode !== 'string' ||
    !/^\d{6}$/.test(pairingCode)
  )
    return failure('Choose a port from 1024 to 65535 and a six-digit pairing code.');

  const encodedMap = JSON.stringify(request.jointMap);

  if (!encodedMap || encodedMap.length > 2 * 1024 * 1024) return failure('The joint map is larger than 2 MB.');

  const deployment = installationSpec(request.spec, request.jointMap, mapOf(request.jointMap));

  return {
    ...targetOf(request.target),
    ...deployment,
    name: robotName(request.jointMap),
    key: keyOf(request.key),
    port,
    pairingCode,
    encodedMap,
  };
}
