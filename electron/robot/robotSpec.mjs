import { LADDER } from './ladder.mjs';
import { ROS2, ros2JointsProblem, ros2TopicProblem } from './ros2.mjs';
import { copiedUnits, unitsArgs, unitsProblem } from './servoUnits.mjs';
import { G1_WRITABLE_IDS, g1JointName, UNITREE_G1 } from './unitreeG1.mjs';

export { LADDER };

export const FAMILIES = ['feetech', 'dynamixel'];
export const CLASSES = ['arm', 'legged'];
export const MAX_SERVOS = 32;

const SPEC_KEYS = ['class', 'emulated', 'family', 'ids'];
const G1_KEYS = ['emulated', 'family'];
const ROS2_KEYS = ['controller', 'emulated', 'family', 'joints'];
const CONTROLLER_KEYS = ['kind', 'topic'];
const OPTIONAL_SPEC_KEYS = ['factory', 'units'];
const ONLY_EMULATED = 'Only an emulated robot can connect: family, servo IDs, class and emulated, nothing else.';
const ONLY_ROS2 = 'Only an emulated ROS 2 robot can connect: family, controller, joints and emulated, nothing else.';
const MOTORS_LOCKED = 'Real motors are locked in this build. Connect an emulated robot instead.';
const BARE_COMMANDS = new Set(['heartbeat', 'stop', 'fall', 'release', 'clear_fault', 'recheck', 'plug_in']);
const MAX_MODEL = 65535;

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

const optionalKeys = (spec) => OPTIONAL_SPEC_KEYS.filter((key) => Object.hasOwn(spec, key));

const knownSpecKeys = (spec) =>
  sameKeys(spec, [...SPEC_KEYS, ...optionalKeys(spec)].sort()) &&
  (!Object.hasOwn(spec, 'factory') || spec.factory === true);

function specProblem(spec) {
  if (!isPlainObject(spec) || !knownSpecKeys(spec)) return ONLY_EMULATED;

  if (spec.emulated !== true) return MOTORS_LOCKED;

  if (!FAMILIES.includes(spec.family)) return 'Choose Feetech or Dynamixel servos.';

  if (!CLASSES.includes(spec.class)) return 'Choose an arm or a legged robot.';

  const ids = idsProblem(spec.ids);

  if (ids || !Object.hasOwn(spec, 'units')) return ids;

  return unitsProblem(spec.units, spec.ids);
}

const asksFor = (spec, family) => isPlainObject(spec) && spec.family === family;

function g1Problem(spec) {
  if (!sameKeys(spec, G1_KEYS)) return ONLY_EMULATED;

  return spec.emulated === true ? null : MOTORS_LOCKED;
}

const G1_SPEC = Object.freeze({ family: UNITREE_G1, ids: G1_WRITABLE_IDS, class: 'legged', emulated: true });

const plainController = (controller) => isPlainObject(controller) && sameKeys(controller, CONTROLLER_KEYS);

function ros2ShapeProblem(spec) {
  if (!sameKeys(spec, ROS2_KEYS) || !plainController(spec.controller)) return ONLY_ROS2;

  return spec.emulated === true ? null : MOTORS_LOCKED;
}

function checkedRos2Spec(spec) {
  const shape = ros2ShapeProblem(spec);

  if (shape) return { ok: false, message: shape };

  const { kind, topic } = spec.controller;
  const joints = Array.isArray(spec.joints) ? [...spec.joints] : null;
  const problem = ros2TopicProblem(kind, topic) ?? ros2JointsProblem(kind, joints);

  if (problem) return { ok: false, message: problem };

  return {
    ok: true,
    spec: {
      family: ROS2,
      ids: joints.map((_, k) => k + 1),
      class: 'arm',
      emulated: true,
      controller: { kind, topic },
      joints,
    },
  };
}

function checkedServoSpec(spec) {
  const g1 = asksFor(spec, UNITREE_G1);
  const problem = g1 ? g1Problem(spec) : specProblem(spec);

  if (problem) return { ok: false, message: problem };

  if (g1) return { ok: true, spec: { ...G1_SPEC, ids: [...G1_SPEC.ids] } };

  const checked = { family: spec.family, ids: [...spec.ids], class: spec.class, emulated: true };
  const factory = spec.factory === true ? { factory: true } : {};
  const units = Object.hasOwn(spec, 'units') ? { units: copiedUnits(spec.units) } : {};

  return { ok: true, spec: { ...checked, ...factory, ...units } };
}

export const checkedRobotSpec = (spec) => (asksFor(spec, ROS2) ? checkedRos2Spec(spec) : checkedServoSpec(spec));

const g1Args = (_spec, artefacts) => ['--family', UNITREE_G1, '--emulated', '--artefacts', artefacts];

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
  ...(spec.factory === true ? ['--factory'] : []),
  ...unitsArgs(spec, artefacts),
];

const ros2Args = (spec, artefacts) => [
  '--family',
  ROS2,
  '--controller',
  spec.controller.kind,
  '--topic',
  spec.controller.topic,
  '--joints',
  spec.joints.join(','),
  '--emulated',
  '--artefacts',
  artefacts,
];

const FAMILY_ARGS = new Map([
  [UNITREE_G1, g1Args],
  [ROS2, ros2Args],
]);

export const daemonArgs = (spec, artefacts) => (FAMILY_ARGS.get(spec.family) ?? servoArgs)(spec, artefacts);

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

const ZERO_COUNTS = 2048;
const RANGE_RAD = 2.8;

function calibrationName(spec, id, k) {
  if (spec.family === UNITREE_G1) return g1JointName(id);

  return spec.family === ROS2 ? spec.joints[k] : `servo ${id}`;
}

export const emulatedCalibration = (spec) => ({
  joints: spec.ids.map((id, k) => ({
    id,
    name: calibrationName(spec, id, k),
    zero_counts: ZERO_COUNTS,
    direction: 1,
    min_rad: -RANGE_RAD,
    max_rad: RANGE_RAD,
  })),
  class: spec.class,
});

export const jointRadians = (counts, joint) => (joint.direction * (counts - joint.zero_counts) * 2 * Math.PI) / 4096;

export const isServoFamily = (spec) => FAMILIES.includes(spec?.family);

const MOUNT_KEYS = ['direction', 'id', 'zero_counts'];
const MAX_COUNTS = 4095;

const isCounts = (value) => Number.isInteger(value) && value >= 0 && value <= MAX_COUNTS;

const isMount = (mount, ids) =>
  isPlainObject(mount) &&
  sameKeys(mount, MOUNT_KEYS) &&
  ids.includes(mount.id) &&
  isCounts(mount.zero_counts) &&
  (mount.direction === 1 || mount.direction === -1);

const isPlainArray = (value) => Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype;

export function checkedMounts(ask, spec) {
  if (!isPlainArray(ask) || ask.length === 0 || ask.length > spec.ids.length) return null;

  const mounts = Array.from(ask);
  const fits = mounts.every((mount) => isMount(mount, spec.ids));

  if (!fits || new Set(mounts.map((mount) => mount.id)).size !== mounts.length) return null;

  return mounts.map(({ id, zero_counts, direction }) => ({ id, zero_counts, direction }));
}

export const calibrationMounts = (calibration) =>
  calibration.joints.map(({ id, zero_counts, direction }) => ({ id, zero_counts, direction }));

export function mountedCalibration(calibration, mounts) {
  const byId = new Map(mounts.map((mount) => [mount.id, mount]));

  return {
    ...calibration,
    joints: calibration.joints.map((joint) => ({ ...joint, ...byId.get(joint.id) })),
  };
}
