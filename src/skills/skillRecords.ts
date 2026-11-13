import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation } from '../types/robotics';
import {
  currentDesign,
  skillFreshness,
  skillHash,
  type ArenaEvidence,
  type Freshness,
  type Skill,
  type SkillBinding,
  type SkillOrigin,
} from './artifacts';
import type { Environment } from './environment';
import { hashOf } from './hash';
import { kitEnvironment, type TrainedEntry } from './kitEnvironment';
import { moveEnvironment } from './moveEnvironment';
import type { SnapshotRef } from './snapshots';
import { plural } from '../../electron/plural.mjs';

export interface MoveTag {
  animation: string;
  reference: string;
}

export const moveTag = (animation: string, environment: Environment): MoveTag => ({
  animation,
  reference: hashOf(environment.reference ?? null),
});

export interface CaseTag {
  id: string;
  model: string;
}

export interface SkillRecord {
  hash: string;
  name: string;
  kit: TrainedEntry | null;
  move?: MoveTag | null;
  case?: CaseTag | null;
  goal: string | null;
  binding: SkillBinding;
  evidence: ArenaEvidence | null;
  origin: SkillOrigin | null;
  environment: Environment | null;
  snapshots?: SnapshotRef[];
  createdAt: string;
}

export function skillRecord(
  skill: Skill,
  options: {
    kit: TrainedEntry | null;
    move?: MoveTag;
    case?: CaseTag;
    goal?: string | null;
    environment?: Environment | null;
  },
): SkillRecord {
  const rebuilt = !!options.kit || !!options.move;

  return {
    hash: skillHash(skill),
    name: skill.name,
    kit: options.kit,
    ...(options.move ? { move: options.move } : {}),
    ...(options.case ? { case: options.case } : {}),
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

export function arenaLine(evidence: ArenaEvidence): string {
  const worst = [...evidence.variants].sort((a, b) => a.passes / a.trials - b.passes / b.trials)[0];
  const share = `at least ${Math.floor(evidence.lowerBound * 100)}%`;

  return worst ? `${worst.passes} of ${plural(worst.trials, 'try', 'tries')}, ${share}` : share;
}

export function withRecord(records: SkillRecord[], record: SkillRecord): SkillRecord[] {
  return [...records.filter((r) => r.hash !== record.hash), record];
}
