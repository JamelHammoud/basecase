import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import {
  currentDesign,
  modelHashes,
  skillFreshness,
  skillHash,
  type ArenaEvidence,
  type Freshness,
  type Skill,
  type SkillBinding,
  type SkillOrigin,
} from './artifacts';
import type { CoachDirection, CoachSignal } from './coachSignals';
import type { Environment } from './environment';
import { hashOf } from './hash';
import { kitEnvironment, type TrainedEntry } from './kitEnvironment';
import { moveEnvironment } from './moveEnvironment';
import type { SnapshotRef } from './snapshots';
import type { TwinVerdict } from '../fleet/twinArena';
import { plural } from '../../electron/plural.mjs';
import { percent } from '../../electron/percent.mjs';
import { robotSchema, type RobotSchema } from './robotSchema';

export interface MoveTag {
  animation: string;
  reference: string;
}

export const moveTag = (animation: string, environment: Environment): MoveTag => ({
  animation,
  reference: hashOf(environment.reference ?? null),
});

export interface CoachTag {
  words: string;
  reward: string;
  signal: CoachSignal;
  direction: CoachDirection;
  before: number;
  after: number;
  from: string;
}

export interface CaseTag {
  id: string;
  model: string;
}

export interface SkillRecord {
  hash: string;
  name: string;
  kit: TrainedEntry | null;
  kitSource?: RobotSchema;
  warmStartFrom?: string;
  move?: MoveTag | null;
  case?: CaseTag | null;
  coach?: CoachTag | null;
  goal: string | null;
  binding: SkillBinding;
  evidence: ArenaEvidence | null;
  origin: SkillOrigin | null;
  environment: Environment | null;
  snapshots?: SnapshotRef[];
  twins?: Record<string, TwinVerdict>;
  createdAt: string;
}

function kitSource(skill: Skill, model?: SimModel): RobotSchema | undefined {
  if (!model || !skill.evidence?.passed || skill.origin?.method !== 'motor-kit') return;

  const hashes = modelHashes(model);
  const sameModel = Object.entries(hashes).every(([key, value]) => value === skill.binding[key as keyof typeof hashes]);

  if (!sameModel) return;

  return robotSchema(model, { joints: skill.action.joints });
}

export function skillRecord(
  skill: Skill,
  options: {
    kit: TrainedEntry | null;
    move?: MoveTag;
    case?: CaseTag;
    coach?: CoachTag;
    goal?: string | null;
    environment?: Environment | null;
    model?: SimModel;
  },
): SkillRecord {
  const rebuilt = !!options.kit || !!options.move;
  const source = options.kit ? kitSource(skill, options.model) : undefined;

  return {
    hash: skillHash(skill),
    name: skill.name,
    kit: options.kit,
    ...(source ? { kitSource: source } : {}),
    ...(skill.warmStartFrom ? { warmStartFrom: skill.warmStartFrom } : {}),
    ...(options.move ? { move: options.move } : {}),
    ...(options.case ? { case: options.case } : {}),
    ...(options.coach ? { coach: options.coach } : {}),
    goal: options.goal ?? null,
    binding: skill.binding,
    evidence: skill.evidence,
    origin: skill.origin ?? null,
    environment: rebuilt ? null : (options.environment ?? null),
    createdAt: new Date().toISOString(),
  };
}

function rebuiltEnvironment(record: SkillRecord, model: SimModel, animations: readonly RobotAnimation[]) {
  if (record.kit) return kitEnvironment(model, record.kit);

  const animation = animations.find((a) => a.id === record.move?.animation);

  return animation ? moveEnvironment(model, animation) : null;
}

export function recordEnvironment(
  record: SkillRecord,
  model: SimModel,
  animations: readonly RobotAnimation[] = [],
): Environment | null {
  if (!record.kit && !record.move) return record.environment;

  try {
    return rebuiltEnvironment(record, model, animations);
  } catch {
    return null;
  }
}

export interface FreshnessInput {
  design: string;
  model: SimModel;
  animations?: readonly RobotAnimation[];
}

export function recordFreshness(record: SkillRecord, options: FreshnessInput): Freshness {
  const environment = recordEnvironment(record, options.model, options.animations);

  if (!environment) return 'needs-training';

  if (record.move && moveTag(record.move.animation, environment).reference !== record.move.reference)
    return 'needs-training';

  return skillFreshness(record, currentDesign({ ...options, environment }));
}

type Variant = ArenaEvidence['variants'][number];

const passShare = (variant: Variant) => variant.passes / variant.trials;

function lowestByShare<T>(values: readonly T[], share: (value: T) => number): T | undefined {
  if (values.length < 2) return values[0];

  let worst: T | undefined;
  let lowest = Infinity;

  for (const value of values) {
    const current = share(value);

    if (Number.isNaN(current)) return [...values].sort((a, b) => share(a) - share(b))[0];

    if (worst === undefined || current < lowest) {
      worst = value;
      lowest = current;
    }
  }

  return worst;
}

export const worstVariant = (evidence: ArenaEvidence): Variant | undefined =>
  lowestByShare(evidence.variants, passShare);

const worstShare = (evidence: ArenaEvidence) => {
  const worst = worstVariant(evidence);

  return worst ? passShare(worst) : Infinity;
};

export const worstEvidence = (evidence: readonly ArenaEvidence[]): ArenaEvidence | undefined =>
  lowestByShare(evidence, worstShare);

const triesLine = (variant: Variant) => `${variant.passes} of ${plural(variant.trials, 'try', 'tries')}`;

export function arenaLine(evidence: ArenaEvidence): string {
  const worst = worstVariant(evidence);
  const share = `at least ${percent(evidence.lowerBound, { down: true })}`;

  return worst ? `${triesLine(worst)}, ${share}` : share;
}

export function refusedLine(evidence: ArenaEvidence): string {
  const worst = worstVariant(evidence);

  return worst ? `Refused in Arena: ${triesLine(worst)}` : 'Refused in Arena';
}

export function withRecord(records: SkillRecord[], record: SkillRecord): SkillRecord[] {
  return [...records.filter((r) => r.hash !== record.hash), record];
}
