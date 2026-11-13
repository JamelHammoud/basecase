import { G1_WRITABLE_IDS, g1JointName, UNITREE_G1 } from './unitreeG1.mjs';

export const FAMILIES = ['feetech', 'dynamixel'];
export const CLASSES = ['arm', 'legged'];
export const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'];
export const MAX_SERVOS = 32;

const SPEC_KEYS = ['class', 'emulated', 'family', 'ids'];
const G1_KEYS = ['emulated', 'family'];
const ONLY_EMULATED = 'Only an emulated robot can connect: family, servo IDs, class and emulated, nothing else.';
const MOTORS_LOCKED = 'Real motors are locked in this build. Connect an emulated robot instead.';
const BARE_COMMANDS = new Set(['heartbeat', 'stop', 'fall', 'release', 'clear_fault', 'recheck']);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

const sameKeys = (value, keys) => {
  const own = Object.keys(value).sort();

  return own.length === keys.length && own.every((key, i) => key === keys[i]);
};

const isServoId = (id) => Number.isInteger(id) && id >= 1 && id <= 253;

function idsProblem(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 'Give at least one servo ID.';

  if (ids.length > MAX_SERVOS) return `An emulated robot takes at most ${MAX_SERVOS} servos.`;

  if (!ids.every(isServoId)) return 'Servo IDs run from 1 to 253.';

  if (new Set(ids).size !== ids.length) return 'Each servo needs its own ID.';

  return null;
}

function specProblem(spec) {
  if (!isPlainObject(spec) || !sameKeys(spec, SPEC_KEYS)) return ONLY_EMULATED;

  if (spec.emulated !== true) return MOTORS_LOCKED;

  if (!FAMILIES.includes(spec.family)) return 'Choose Feetech or Dynamixel servos.';

  if (!CLASSES.includes(spec.class)) return 'Choose an arm or a legged robot.';

  return idsProblem(spec.ids);
}

const asksForG1 = (spec) => isPlainObject(spec) && spec.family === UNITREE_G1;

function g1Problem(spec) {
  if (!sameKeys(spec, G1_KEYS)) return ONLY_EMULATED;

  return spec.emulated === true ? null : MOTORS_LOCKED;
}

const G1_SPEC = Object.freeze({ family: UNITREE_G1, ids: G1_WRITABLE_IDS, class: 'legged', emulated: true });

export function checkedRobotSpec(spec) {
  const g1 = asksForG1(spec);
  const problem = g1 ? g1Problem(spec) : specProblem(spec);

  if (problem) return { ok: false, message: problem };

  const { family, ids, class: robotClass } = g1 ? G1_SPEC : spec;

  return { ok: true, spec: { family, ids: [...ids], class: robotClass, emulated: true } };
}

const g1Args = (artefacts) => ['--family', UNITREE_G1, '--emulated', '--artefacts', artefacts];

const servoArgs = (spec, artefacts) => [
  '--family',
  spec.family,
  '--ids',
  spec.ids.join(','),
  '--class',
  spec.class,
  '--emulated',
  '--artefacts',
  artefacts,
];

export const daemonArgs = (spec, artefacts) =>
  spec.family === UNITREE_G1 ? g1Args(artefacts) : servoArgs(spec, artefacts);

const isJointValue = (value) => value === null || (typeof value === 'number' && Number.isFinite(value));

function checkedIntent(command, joints) {
  const fits = Array.isArray(command.joints) && command.joints.length === joints && command.joints.every(isJointValue);

  return fits && sameKeys(command, ['cmd', 'joints']) ? { cmd: 'intent', joints: [...command.joints] } : null;
}

export function checkedCommand(command, joints) {
  if (!isPlainObject(command) || typeof command.cmd !== 'string') return null;

  if (command.cmd === 'intent') return checkedIntent(command, joints);

  if (command.cmd === 'enter')
    return LADDER.includes(command.mode) && sameKeys(command, ['cmd', 'mode'])
      ? { cmd: 'enter', mode: command.mode }
      : null;

  return BARE_COMMANDS.has(command.cmd) && sameKeys(command, ['cmd']) ? { cmd: command.cmd } : null;
}

const ZERO_COUNTS = 2048;
const RANGE_RAD = 2.8;

export const emulatedCalibration = (spec) => ({
  joints: spec.ids.map((id) => ({
    id,
    name: spec.family === UNITREE_G1 ? g1JointName(id) : `servo ${id}`,
    zero_counts: ZERO_COUNTS,
    direction: 1,
    min_rad: -RANGE_RAD,
    max_rad: RANGE_RAD,
  })),
  class: spec.class,
});

export const radiansFromCounts = (counts) => ((counts - ZERO_COUNTS) * 2 * Math.PI) / 4096;
