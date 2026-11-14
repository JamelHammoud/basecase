import { BUILTIN_GESTURES, isBuiltinGesture } from '../cameras/gestures/builtinGestures';
import { GESTURE_FEATURES } from '../cameras/gestures/gestureFrame';
import { MAX_EXAMPLE_FRAMES, type GestureExample } from '../cameras/gestures/gestureMatch';
import { asNumber, asRecord, listOf, refuse, type Reader } from './validate';

export interface CaseGesture {
  name: string;
  examples: GestureExample[];
}

export const GESTURE_EVENT = 'gesture';
export const MAX_TAUGHT_GESTURES = 8;
export const EXAMPLES_PER_GESTURE = 3;

const MAX_COORDINATE = 10;
const NAME = /^[a-z][a-z0-9-]{0,31}$/;

export const asGestureName: Reader<string> = (value, where) =>
  typeof value === 'string' && NAME.test(value) ? value : refuse(where, 'must be a short lowercase name');

const readFrame: Reader<number[]> = (value, where) => {
  const frame = listOf(asNumber, GESTURE_FEATURES)(value, where);

  if (frame.length !== GESTURE_FEATURES) refuse(where, `must hold ${GESTURE_FEATURES} numbers`);

  if (frame.some((v) => Math.abs(v) > MAX_COORDINATE)) refuse(where, `holds a number past ${MAX_COORDINATE}`);

  return frame;
};

const readExample: Reader<GestureExample> = (value, where) => {
  const frames = listOf(readFrame, MAX_EXAMPLE_FRAMES)(value, where);

  return frames.length ? frames : refuse(where, 'must hold a frame');
};

const readGesture: Reader<CaseGesture> = (value, where) => {
  const v = asRecord(value, where);
  const name = asGestureName(v.name, `${where}.name`);

  if (isBuiltinGesture(name)) refuse(`${where}.name`, `${name} is built in`);

  return { name, examples: listOf(readExample, EXAMPLES_PER_GESTURE)(v.examples ?? [], `${where}.examples`) };
};

export const readGestures: Reader<CaseGesture[]> = (value, where) => {
  const gestures = listOf(readGesture, MAX_TAUGHT_GESTURES)(value, where);
  const names = gestures.map((g) => g.name);

  if (new Set(names).size !== names.length) refuse(where, 'repeats a name');

  return gestures;
};

export const gestureNames = (gestures: readonly CaseGesture[] = []): string[] => [
  ...BUILTIN_GESTURES,
  ...gestures.map((g) => g.name),
];

export const untaught = (gestures: readonly CaseGesture[] = []) => gestures.filter((g) => !g.examples.length);

export function withGesture(gestures: readonly CaseGesture[] = [], gesture: CaseGesture): CaseGesture[] {
  const at = gestures.findIndex((g) => g.name === gesture.name);

  return at < 0 ? [...gestures, gesture] : gestures.map((g, i) => (i === at ? gesture : g));
}
