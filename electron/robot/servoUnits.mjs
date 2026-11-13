import path from 'node:path';

export const UNITS_FILE = 'units.json';

const MAX_VOLTS = 60;
const MAX_VALUE = 1e4;
const UNIT_KEYS = [
  'armature',
  'delayS',
  'errorGain',
  'errorGainRatio',
  'firmwareKp',
  'friction',
  'kt',
  'maxDuty',
  'maxVelocity',
  'resistance',
  'volts',
];
const POSITIVE_KEYS = UNIT_KEYS.filter((key) => key !== 'friction' && key !== 'volts');
const FRICTION_KEYS = [
  'alpha',
  'base',
  'dthetaStribeck',
  'loadExternal',
  'loadExternalQuad',
  'loadExternalStribeck',
  'loadMotor',
  'loadMotorQuad',
  'loadMotorStribeck',
  'stribeck',
  'viscous',
];
const ONE_PER_ID = 'Give one servo model, or null, per servo ID.';
const MODEL_SHAPE = 'A servo model takes only the numbers of its fit, nothing else.';
const MODEL_RANGE = 'A servo model has a number out of range.';

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

const hasExactly = (value, keys) => {
  if (!isPlainObject(value)) return false;

  const own = Object.keys(value).sort();

  return own.length === keys.length && own.every((key, i) => key === keys[i]);
};

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isPositive = (value, max = MAX_VALUE) => isNumber(value) && value > 0 && value <= max;
const isNonNegative = (value) => isNumber(value) && value >= 0 && value <= MAX_VALUE;

const hasShape = (unit) => hasExactly(unit, UNIT_KEYS) && hasExactly(unit.friction, FRICTION_KEYS);

const inRange = (unit) =>
  isPositive(unit.volts, MAX_VOLTS) &&
  POSITIVE_KEYS.every((key) => isPositive(unit[key])) &&
  FRICTION_KEYS.every((key) => isNonNegative(unit.friction[key]));

function unitProblem(unit) {
  if (unit === null) return null;

  if (!hasShape(unit)) return MODEL_SHAPE;

  return inRange(unit) ? null : MODEL_RANGE;
}

export function unitsProblem(units, ids) {
  if (!Array.isArray(units) || units.length !== ids.length) return ONE_PER_ID;

  return units.map(unitProblem).find(Boolean) ?? null;
}

const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));

const copiedUnit = (unit) => unit && { ...pick(unit, UNIT_KEYS), friction: pick(unit.friction, FRICTION_KEYS) };

export const copiedUnits = (units) => units.map(copiedUnit);

export const unitsJson = (units) => JSON.stringify(units);

export const unitsArgs = (spec, artefacts) => (spec.units ? ['--units', path.join(artefacts, UNITS_FILE)] : []);
