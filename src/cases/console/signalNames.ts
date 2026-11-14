import { VISION_BOX_FIELDS } from './visionSignals';
import { BUILTIN_GESTURES } from '../../cameras/gestures/builtinGestures';
import { hasWildcard, isTopicSignal } from '../../topics/topicIndex';
import { refuse, type Reader } from '../validate';

const BUILTIN: ReadonlySet<string> = new Set(BUILTIN_GESTURES);

export const JOINT_FIELDS = ['target', 'position', 'effort'] as const;
export const ROBOT_FIELDS = ['height', 'tilt', 'speed', 'travelled', 'x', 'z'] as const;
export const INPUT_AXES = ['forward', 'left', 'turn', 'lift', 'grip'] as const;
export const GOAL_FIELDS = ['passed', 'margin', 'failed'] as const;
export const NAMESPACES = [
  'time',
  'joint',
  'robot',
  'probe',
  'input',
  'goal',
  'camera',
  'gesture',
  'vision',
  'topic',
] as const;
export const OPERATOR_INPUTS = ['camera', 'hand', 'face'];

export type JointField = (typeof JOINT_FIELDS)[number];
export type RobotField = (typeof ROBOT_FIELDS)[number];
export type InputAxis = (typeof INPUT_AXES)[number];
export type SignalShape = 'number' | 'labels' | 'camera' | 'topic';

export interface SignalScope {
  declared: ReadonlySet<string>;
  probes: ReadonlySet<string>;
  inputs: ReadonlySet<string>;
  gestures?: ReadonlySet<string>;
}

const SIGNAL_NAME = /^[\w.*-]{1,120}$/u;
const TOPIC_SIGNAL_NAME = /^topic\.[\w./~[\]:*-]{1,234}$/u;
const TOPIC_NAME = /^topic\.[\w./~-]{1,234}$/u;
const TOPIC_REFUSAL = 'must be topic.<name>';
const SHAPES: readonly string[] = ['number', 'labels', 'camera', 'topic'];
const TOPIC_TAKERS: readonly SignalShape[] = ['number', 'labels', 'topic'];

type Shaper = (parts: string[], scope: SignalScope) => SignalShape | string;

const has = (list: readonly string[], value: string | undefined) => value !== undefined && list.includes(value);

const SHAPERS: Record<string, Shaper> = {
  joint: ([id, field]) =>
    id && has(JOINT_FIELDS, field) ? 'number' : `must be joint.<id or *>.${JOINT_FIELDS.join(' or ')}`,
  robot: ([field]) => (has(ROBOT_FIELDS, field) ? 'number' : `must be robot.${ROBOT_FIELDS.join(' or ')}`),
  probe: ([name], scope) => (name && scope.probes.has(name) ? 'number' : 'names no probe of this Case'),
  goal: ([field]) => {
    if (field === 'failed') return 'labels';

    return has(GOAL_FIELDS, field) ? 'number' : `must be goal.${GOAL_FIELDS.join(' or ')}`;
  },
  input: ([source, axis], scope) => {
    if (!source || !scope.inputs.has(source)) return 'names an input this console doesn’t list';

    return has(INPUT_AXES, axis) ? 'number' : `must be input.${source}.${INPUT_AXES.join(' or ')}`;
  },
  gesture: ([name], scope) => {
    if (!scope.inputs.has('camera')) return 'needs the camera input';

    return name && (scope.gestures ?? BUILTIN).has(name) ? 'number' : 'names no gesture of this Case';
  },
  camera: ([key], scope) => {
    if (key === 'operator' && !OPERATOR_INPUTS.some((id) => scope.inputs.has(id)))
      return 'needs the camera, hand or face input';

    return key ? 'camera' : 'must be camera.<name or *>';
  },
  vision: ([camera, label, field, ...extra]) => {
    const valid = camera && label && !extra.length && (!field || field === 'count' || has(VISION_BOX_FIELDS, field));

    return valid
      ? 'number'
      : 'must be vision.<camera>.<class> with count, score, x, y, width, height, timestamp or ageMs';
  },
  topic: ([name]) => (name ? 'topic' : TOPIC_REFUSAL),
};

export function signalShape(id: string, scope: SignalScope): SignalShape | string {
  if (id === 'time' || scope.declared.has(id)) return 'number';

  const [space, ...rest] = id.split('.');
  const shaper = SHAPERS[space];

  if (!shaper || rest.length === 0) return 'names no signal';

  return shaper(rest, scope);
}

const wellNamed = (value: string) => (isTopicSignal(value) ? TOPIC_SIGNAL_NAME : SIGNAL_NAME).test(value);

const shapeFits = (shape: SignalShape, shapes: readonly SignalShape[]) =>
  shape === 'topic' ? shapes.some((s) => TOPIC_TAKERS.includes(s)) : shapes.includes(shape);

export const signalRef =
  (scope: SignalScope, shapes: readonly SignalShape[], many = false): Reader<string> =>
  (value, where) => {
    if (typeof value !== 'string' || !wellNamed(value)) return refuse(where, 'must be a signal name');

    const shape = signalShape(value, scope);

    if (!SHAPES.includes(shape)) return refuse(where, `${value} ${shape}`);

    const fits = shapeFits(shape as SignalShape, shapes) && (many || !hasWildcard(value));

    return fits ? value : refuse(where, `${value} can’t be shown here`);
  };

export const readTopicRef: Reader<string> = (value, where) =>
  typeof value === 'string' && TOPIC_NAME.test(value) ? value : refuse(where, TOPIC_REFUSAL);

export const matches = (pattern: string, id: string) => {
  if (!pattern.includes('*')) return pattern === id;

  const [before, after] = pattern.split('*');

  return (
    id.startsWith(before) && id.endsWith(after) && !id.slice(before.length, id.length - after.length).includes('.')
  );
};
