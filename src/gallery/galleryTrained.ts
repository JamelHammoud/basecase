import { asId, asRecord, asString, oneOf, refuse } from '../cases/validate';
import { isPolicySpec, type PolicySpec } from '../sim/policy';
import { skillHash, type Skill } from '../skills/artifacts';
import { isSkill } from '../skills/bundle';
import type { SkillRecord } from '../skills/skillRecords';
import type { PolicyRecord } from '../types/robotics';

export type GalleryTrained =
  { kind: 'policy'; record: PolicyRecord; spec: PolicySpec } | { kind: 'skill'; record: SkillRecord; skill: Skill };

function readPolicy(t: Record<string, unknown>): GalleryTrained {
  const record = asRecord(t.record, 'trained.record');

  asId(record.id, 'trained.record.id');
  asString(record.name, 'trained.record.name');
  oneOf(['stand', 'walk'])(record.task, 'trained.record.task');

  if (!isPolicySpec(t.spec)) return refuse('trained.spec', 'isn’t a policy');

  return { kind: 'policy', record: record as unknown as PolicyRecord, spec: t.spec };
}

function readSkill(t: Record<string, unknown>): GalleryTrained {
  const record = asRecord(t.record, 'trained.record');

  asString(record.name, 'trained.record.name');

  if (!isSkill(t.skill)) return refuse('trained.skill', 'isn’t a skill');

  if (record.hash !== skillHash(t.skill)) return refuse('trained.record', 'doesn’t match its skill');

  return { kind: 'skill', record: record as unknown as SkillRecord, skill: t.skill };
}

export function readTrained(value: unknown): GalleryTrained {
  const t = asRecord(value, 'trained');

  if (t.kind === 'policy') return readPolicy(t);

  if (t.kind === 'skill') return readSkill(t);

  return refuse('trained', 'must be a policy or a skill');
}
