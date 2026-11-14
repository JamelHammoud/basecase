import type { SimModel } from '../../sim/mjcfTypes';
import { ROBOT_PRESETS, type RobotPreset } from '../../utils/robotImport/presets';
import {
  armsOf,
  matchByName,
  prefilled,
  rememberedPairs,
  targetJoints,
  type JointPairs,
  type MatchInput,
} from './jointMatch';
import type { ReplayPlan } from './kinematicRecording';
import { DataImportError } from './types';
import { detectUnit, type ColumnSpan } from './units';

const ROBOT_TYPES: Array<[RegExp, string]> = [
  [/^so[-_]?10[01]/i, 'so101'],
  [/(^|[-_])g1([-_]|$)/i, 'unitree-g1'],
  [/(^|[-_])h1([-_]|$)/i, 'unitree-h1'],
  [/go2/i, 'unitree-go2'],
  [/panda|franka/i, 'franka-panda'],
  [/ur5/i, 'ur5e'],
];

export function robotTypePreset(robotType: string | null): RobotPreset | null {
  const id = robotType ? ROBOT_TYPES.find(([pattern]) => pattern.test(robotType))?.[1] : undefined;

  return ROBOT_PRESETS.find((p) => p.id === id) ?? null;
}

export type ImportStep =
  | { kind: 'ready'; plan: ReplayPlan }
  | { kind: 'match'; input: MatchInput; joints: JointPairs }
  | { kind: 'no-robot'; preset: RobotPreset | null };

export interface SourceColumns {
  names: string[];
  spans: ColumnSpan[];
}

export function matchInput(
  source: SourceColumns,
  model: SimModel,
  jointNames: Record<string, string> = {},
): MatchInput {
  const unit = detectUnit(source.spans);

  if (!unit)
    throw new DataImportError('Basecase couldn’t tell whether these joints are in radians, degrees or servo counts.');

  const targets = targetJoints(model, jointNames);

  return {
    names: source.names,
    spans: source.spans,
    unit,
    targets,
    robots: armsOf(
      targets,
      model.robots.map((r) => r.key),
    ),
  };
}

const sceneHas = (model: Pick<SimModel, 'robots'>, preset: RobotPreset) =>
  model.robots.some((r) => r.name.toLowerCase().includes(preset.title.toLowerCase()));

interface StepInput {
  input: MatchInput;
  model: Pick<SimModel, 'robots'>;
  robotType: string | null;
  remembered: JointPairs | null;
}

export function importStep({ input, model, robotType, remembered }: StepInput): ImportStep {
  const kept = rememberedPairs(remembered, input);
  const ready = (joints: JointPairs): ImportStep => ({
    kind: 'ready',
    plan: { joints, unit: input.unit, spans: input.spans },
  });

  if (kept) return ready(kept);

  const match = matchByName(input);

  if (match.complete) return ready(match.joints);

  const preset = robotTypePreset(robotType);
  const unmatched = match.joints.every((j) => j === null);

  if (!input.targets.length || (unmatched && preset && !sceneHas(model, preset))) return { kind: 'no-robot', preset };

  return { kind: 'match', input, joints: prefilled(input, match) };
}
