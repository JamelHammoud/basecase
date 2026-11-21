import { LADDER } from './ladder.mjs';

export const FAMILIES = ['feetech', 'dynamixel'];

const BARE_COMMANDS = new Set(['heartbeat', 'stop', 'fall', 'release', 'clear_fault', 'recheck', 'plug_in']);
const MAX_MODEL = 65535;

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

export const sameKeys = (value, keys) => {
  const own = Object.keys(value).sort();

  return own.length === keys.length && own.every((key, i) => key === keys[i]);
};

export const isServoId = (id) => Number.isInteger(id) && id >= 1 && id <= 253;

const isJointValue = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));

function checkedIntent(command, joints) {
  const fits = Array.isArray(command.joints) && command.joints.length === joints && command.joints.every(isJointValue);

  return fits && sameKeys(command, ['cmd', 'joints']) ? { cmd: 'intent', joints: [...command.joints] } : null;
}

const isModel = (model) => Number.isInteger(model) && model >= 0 && model <= MAX_MODEL;

function checkedAssignId(command) {
  const fits = sameKeys(command, ['cmd', 'id', 'model']) && isServoId(command.id) && isModel(command.model);

  return fits ? { cmd: 'assign_id', id: command.id, model: command.model } : null;
}

export function checkedCommand(command, joints) {
  if (!isPlainObject(command) || typeof command.cmd !== 'string') return null;

  if (command.cmd === 'intent') return checkedIntent(command, joints);

  if (command.cmd === 'assign_id') return checkedAssignId(command);

  if (command.cmd === 'enter')
    return LADDER.includes(command.mode) && sameKeys(command, ['cmd', 'mode'])
      ? { cmd: 'enter', mode: command.mode }
      : null;

  return BARE_COMMANDS.has(command.cmd) && sameKeys(command, ['cmd']) ? { cmd: command.cmd } : null;
}

export const isServoFamily = (spec) => FAMILIES.includes(spec?.family);

export const jointRadians = (counts, joint) => (joint.direction * (counts - joint.zero_counts) * 2 * Math.PI) / 4096;

export const calibrationMounts = (calibration) =>
  calibration.joints.map(({ id, zero_counts, direction }) => ({ id, zero_counts, direction }));
