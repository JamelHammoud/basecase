import type { SimModel } from '../sim/mjcfTypes';
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
import { kitEnvironment, type TrainedEntry } from './kitEnvironment';

export interface SkillRecord {
  hash: string;
  name: string;
  kit: TrainedEntry | null;
  goal: string | null;
  binding: SkillBinding;
  evidence: ArenaEvidence | null;
  origin: SkillOrigin | null;
  environment: Environment | null;
  createdAt: string;
}

export function skillRecord(
  skill: Skill,
  options: { kit: TrainedEntry | null; goal?: string | null; environment?: Environment | null },
): SkillRecord {
  return {
    hash: skillHash(skill),
    name: skill.name,
    kit: options.kit,
    goal: options.goal ?? null,
    binding: skill.binding,
    evidence: skill.evidence,
    origin: skill.origin ?? null,
    environment: options.kit ? null : (options.environment ?? null),
    createdAt: new Date().toISOString(),
  };
}

export function recordEnvironment(record: SkillRecord, model: SimModel): Environment | null {
  if (!record.kit) return record.environment;

  try {
    return kitEnvironment(model, record.kit);
  } catch {
    return null;
  }
}

export function recordFreshness(record: SkillRecord, options: { design: string; model: SimModel }): Freshness {
  const environment = recordEnvironment(record, options.model);

  if (!environment) return 'needs-training';

  return skillFreshness(record, currentDesign({ ...options, environment }));
}

export function arenaLine(evidence: ArenaEvidence): string {
  const worst = [...evidence.variants].sort((a, b) => a.passes / a.trials - b.passes / b.trials)[0];
  const share = `at least ${Math.floor(evidence.lowerBound * 100)}%`;

  return worst ? `${worst.passes} of ${worst.trials} tries, ${share}` : share;
}

export function withRecord(records: SkillRecord[], record: SkillRecord): SkillRecord[] {
  return [...records.filter((r) => r.hash !== record.hash), record];
}
