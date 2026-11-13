export const FAMILIES = ['feetech', 'dynamixel'];
export const CLASSES = ['arm', 'legged'];
export const LADDER = ['look', 'set_up', 'test', 'rehearse', 'first_run', 'policy', 'longer_runs'];
export const MAX_SERVOS = 32;

const SPEC_KEYS = ['class', 'emulated', 'family', 'ids'];
const FACTORY_SPEC_KEYS = ['class', 'emulated', 'factory', 'family', 'ids'];
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

const knownSpecKeys = (spec) =>
  sameKeys(spec, SPEC_KEYS) || (sameKeys(spec, FACTORY_SPEC_KEYS) && spec.factory === true);

function specProblem(spec) {
  if (!isPlainObject(spec) || !knownSpecKeys(spec))
    return 'Only an emulated robot can connect: family, servo IDs, class and emulated, nothing else.';

  if (spec.emulated !== true) return 'Real motors are locked in this build. Connect an emulated robot instead.';

  if (!FAMILIES.includes(spec.family)) return 'Choose Feetech or Dynamixel servos.';

  if (!CLASSES.includes(spec.class)) return 'Choose an arm or a legged robot.';

  return idsProblem(spec.ids);
}

export function checkedRobotSpec(spec) {
  const problem = specProblem(spec);

  if (problem) return { ok: false, message: problem };

  const checked = { family: spec.family, ids: [...spec.ids], class: spec.class, emulated: true };

  return { ok: true, spec: spec.factory === true ? { ...checked, factory: true } : checked };
}

export const daemonArgs = (spec, artefacts) => [
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
];

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

export const emulatedCalibration = (spec) => ({
  joints: spec.ids.map((id) => ({
    id,
    name: `servo ${id}`,
    zero_counts: ZERO_COUNTS,
    direction: 1,
    min_rad: -RANGE_RAD,
    max_rad: RANGE_RAD,
  })),
  class: spec.class,
});

export const radiansFromCounts = (counts) => ((counts - ZERO_COUNTS) * 2 * Math.PI) / 4096;
