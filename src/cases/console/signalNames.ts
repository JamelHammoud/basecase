import { BUILTIN_GESTURES } from '../../cameras/gestures/builtinGestures';
import { refuse, type Reader } from '../validate';

const BUILTIN: ReadonlySet<string> = new Set(BUILTIN_GESTURES);

export const JOINT_FIELDS = ['target', 'position', 'effort'] as const;
export const ROBOT_FIELDS = ['height', 'tilt', 'speed', 'travelled', 'x', 'z'] as const;
export const INPUT_AXES = ['forward', 'left', 'turn', 'lift', 'grip'] as const;
export const GOAL_FIELDS = ['passed', 'margin', 'failed'] as const;
export const NAMESPACES = ['time', 'joint', 'robot', 'probe', 'input', 'goal', 'camera', 'gesture'] as const;
export const OPERATOR_INPUTS = ['camera', 'hand', 'face'];

export type JointField = (typeof JOINT_FIELDS)[number];
export type RobotField = (typeof ROBOT_FIELDS)[number];
export type InputAxis = (typeof INPUT_AXES)[number];
export type SignalShape = 'number' | 'labels' | 'camera';

export interface SignalScope {
  declared: ReadonlySet<string>;
  probes: ReadonlySet<string>;
  inputs: ReadonlySet<string>;
  gestures?: ReadonlySet<string>;
}

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
};

export function signalShape(id: string, scope: SignalScope): SignalShape | string {
  if (id === 'time' || scope.declared.has(id)) return 'number';

  const [space, ...rest] = id.split('.');
  const shaper = SHAPERS[space];

  if (!shaper || rest.length === 0) return 'names no signal';

  return shaper(rest, scope);
}

export const signalRef =
  (scope: SignalScope, shapes: readonly SignalShape[], many = false): Reader<string> =>
  (value, where) => {
    if (typeof value !== 'string' || !/^[\w.*-]{1,120}$/.test(value)) return refuse(where, 'must be a signal name');

    const shape = signalShape(value, scope);

    if (!['number', 'labels', 'camera'].includes(shape)) return refuse(where, `${value} ${shape}`);

    const fits = shapes.includes(shape as SignalShape) && (many || !value.includes('*'));

    return fits ? value : refuse(where, `${value} can’t be shown here`);
  };

export const matches = (pattern: string, id: string) => {
  if (!pattern.includes('*')) return pattern === id;

  const [before, after] = pattern.split('*');

  return (
    id.startsWith(before) && id.endsWith(after) && !id.slice(before.length, id.length - after.length).includes('.')
  );
};

export function signalNamesOf(scope: SignalScope, joints: readonly string[], live: readonly string[]): string[] {
  const named = [
    'time',
    ...scope.declared,
    ...joints.flatMap((id) => JOINT_FIELDS.map((field) => `joint.${id}.${field}`)),
    ...ROBOT_FIELDS.map((field) => `robot.${field}`),
    ...[...scope.probes].map((probe) => `probe.${probe}`),
    ...[...scope.inputs].flatMap((source) => INPUT_AXES.map((axis) => `input.${source}.${axis}`)),
    ...GOAL_FIELDS.map((field) => `goal.${field}`),
    ...live,
  ];
  const wildcards = [
    ...(joints.length ? JOINT_FIELDS.map((field) => `joint.*.${field}`) : []),
    ...(named.some((id) => id.startsWith('camera.')) ? ['camera.*'] : []),
  ];

  return [...new Set([...wildcards, ...named])];
}
