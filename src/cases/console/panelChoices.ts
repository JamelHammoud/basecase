import { BUILTIN_GESTURES } from '../../cameras/gestures/builtinGestures';
import type { NewPanel } from './layoutEdits';
import { CASE_ACTIONS, PANEL_KIND_NAMES, type PanelKind } from './panelKinds';
import { GOAL_FIELDS, INPUT_AXES, JOINT_FIELDS, ROBOT_FIELDS, type SignalScope } from './signalNames';

export type AddableKind = Exclude<PanelKind, 'code'>;

export const ADDABLE_KINDS = PANEL_KIND_NAMES.filter((k): k is AddableKind => k !== 'code');

export interface PanelChoices {
  options: string[];
  many: boolean;
  alone?: string[];
}

export interface SignalSources {
  scope: SignalScope;
  joints: readonly string[];
  cameras: readonly string[];
}

const PLOT_MAX = 8;

export function numberSignals({ scope, joints }: SignalSources, wildcards: boolean): string[] {
  const gestures = scope.inputs.has('camera') ? [...(scope.gestures ?? BUILTIN_GESTURES)] : [];

  return [
    'time',
    ...(wildcards && joints.length ? JOINT_FIELDS.map((f) => `joint.*.${f}`) : []),
    ...joints.flatMap((id) => JOINT_FIELDS.map((f) => `joint.${id}.${f}`)),
    ...ROBOT_FIELDS.map((f) => `robot.${f}`),
    ...[...scope.probes].map((p) => `probe.${p}`),
    ...[...scope.inputs].flatMap((source) => INPUT_AXES.map((axis) => `input.${source}.${axis}`)),
    ...GOAL_FIELDS.filter((f) => f !== 'failed').map((f) => `goal.${f}`),
    ...gestures.map((g) => `gesture.${g}`),
    ...scope.declared,
  ];
}

export function panelChoices(kind: AddableKind, sources: SignalSources): PanelChoices {
  const one = (options: string[]) => ({ options, many: false });

  return {
    camera: () => one(['camera.*', ...sources.cameras.map((c) => `camera.${c}`)]),
    value: () => one(numberSignals(sources, false)),
    plot: () => ({ options: numberSignals(sources, true), many: true }),
    table: () => ({
      options: ['servos', 'joints', ...numberSignals(sources, true)],
      many: true,
      alone: ['servos', 'joints'],
    }),
    button: () => one([...CASE_ACTIONS]),
    list: () => one(['tries', 'failures']),
    text: () => one(['brief']),
    map: () => one([]),
  }[kind]();
}

export function picked(choices: PanelChoices, current: readonly string[], option: string): string[] {
  if (!choices.many || choices.alone?.includes(option)) return current.includes(option) ? [] : [option];

  const rest = current.filter((o) => !choices.alone?.includes(o));

  if (rest.includes(option)) return rest.filter((o) => o !== option);

  return rest.length < PLOT_MAX ? [...rest, option] : rest;
}

const table = (choice: readonly string[]): Record<string, unknown> => {
  const of = choice[0];

  return of === 'servos' || of === 'joints' ? { of } : { of: 'signals', signals: [...choice] };
};

export function newPanel(kind: AddableKind, choice: readonly string[]): NewPanel {
  const [first] = choice;
  const config: Record<string, unknown> = {
    camera: { signal: first },
    value: { signal: first },
    plot: { signals: [...choice] },
    table: table(choice),
    button: { action: first },
    list: { of: first },
    text: { of: first },
    map: {},
  }[kind];

  return { kind, ...config };
}

export const ready = (choices: PanelChoices, choice: readonly string[]) => !choices.options.length || choice.length > 0;
