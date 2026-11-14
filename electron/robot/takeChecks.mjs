import { MAX_INPUT_VALUES } from './robotTake.mjs';

const MAX_TWIN = 64;
const MAX_TEXT = 128;
const SAFE_ID = /^[\w-]{1,128}$/;
const INPUT_ID = /^[a-z][a-z0-9-]{0,31}$/;

const isPlain = (value) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const onlyKeys = (value, keys) => Object.keys(value).every((k) => keys.includes(k));

const isText = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT;

const isNumberOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

export function checkedTakeContext(ask) {
  if (!isPlain(ask) || !onlyKeys(ask, ['sceneId', 'robot', 'joints'])) return null;

  if (!SAFE_ID.test(ask.sceneId) || !isText(ask.robot)) return null;

  if (!Array.isArray(ask.joints) || ask.joints.length > MAX_TWIN || !ask.joints.every(isText)) return null;

  return { sceneId: ask.sceneId, robot: ask.robot, joints: [...ask.joints] };
}

function checkedTwin(twin) {
  if (twin === undefined) return null;

  return Array.isArray(twin) && twin.length <= MAX_TWIN && twin.every(isNumberOrNull) ? [...twin] : undefined;
}

function checkedInput(input) {
  if (input === undefined) return null;

  if (!isPlain(input) || !onlyKeys(input, ['id', 'values']) || !INPUT_ID.test(input.id)) return undefined;

  const { values } = input;
  const fits = Array.isArray(values) && values.length <= MAX_INPUT_VALUES && values.every(isNumberOrNull);

  return fits ? { id: input.id, values: [...values] } : undefined;
}

export function checkedTakeSample(ask) {
  if (!isPlain(ask) || !onlyKeys(ask, ['twin', 'input'])) return null;

  const twin = checkedTwin(ask.twin);
  const input = checkedInput(ask.input);

  return twin === undefined || input === undefined ? null : { twin, input };
}
