import { createHash } from 'node:crypto';

export const isPairingKey = (key) => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);

export const robotId = (key) =>
  isPairingKey(key) ? createHash('sha256').update(Buffer.from(key, 'hex')).digest('hex') : null;

export const matchesRobotId = (id, key, expectedId) =>
  isPairingKey(id) && id === robotId(key) && (expectedId === undefined || id === expectedId);
