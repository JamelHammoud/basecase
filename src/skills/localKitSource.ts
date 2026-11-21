import type { SimModel } from '../sim/mjcfTypes';
import { skillHash, type Skill } from './artifacts';
import { hashOf, isHash } from './hash';
import { mapKitSkill } from './hubSkill';
import type { TrainedEntry } from './kitEnvironment';
import { kitRobot } from './kitModel';
import { policyObservation } from './environment';
import { kitSkillName, type KitWarm } from './motorKit';
import { isTrainablePolicy } from './policyCheck';
import { isRobotSchema, jointMap, robotSchema, type RobotSchema } from './robotSchema';
import type { SkillRecord } from './skillRecords';
import { isProvenSkill } from './skillRank';

const MAX_SOURCE_JOINTS = 256;

interface Target {
  model: SimModel;
  entry: TrainedEntry;
  admit?: (source: RobotSchema, target: RobotSchema) => boolean;
}

function usableSchema(value: unknown): value is RobotSchema {
  const candidate = value as Partial<RobotSchema> | null;

  return (
    Array.isArray(candidate?.joints) &&
    candidate.joints.length <= MAX_SOURCE_JOINTS &&
    Array.isArray(candidate.limbs) &&
    candidate.limbs.length <= MAX_SOURCE_JOINTS &&
    isRobotSchema(value) &&
    value.joints.length > 0 &&
    value.joints.every((joint) => joint.depth > 0 && joint.depth <= MAX_SOURCE_JOINTS) &&
    new Set(value.joints.map((joint) => joint.id)).size === value.joints.length
  );
}

function matchesEntry(record: SkillRecord, target: Target) {
  return (
    record.kit === target.entry &&
    record.name === kitSkillName(target.entry) &&
    record.origin?.method === 'motor-kit' &&
    record.evidence?.passed === true &&
    isHash(record.hash) &&
    usableSchema(record.kitSource)
  );
}

function preferred(candidate: SkillRecord, best: SkillRecord | null, design: string) {
  if (!best) return true;

  const sameDesign = candidate.binding.design === design;
  const bestDesign = best.binding.design === design;

  if (sameDesign !== bestDesign) return sameDesign;

  if (candidate.createdAt !== best.createdAt) return candidate.createdAt > best.createdAt;

  return candidate.hash < best.hash;
}

export function selectKitSource(records: readonly SkillRecord[], target: Target): SkillRecord | null {
  const robot = kitRobot(target.model);
  const schema = robotSchema(target.model, { robot: robot.key, joints: robot.joints });

  if (!usableSchema(schema)) return null;

  let best: SkillRecord | null = null;

  for (const record of records) {
    if (!matchesEntry(record, target) || !jointMap(record.kitSource!, schema).ok) continue;

    if (target.admit && !target.admit(record.kitSource!, schema)) continue;

    if (preferred(record, best, robot.key)) best = record;
  }

  return best;
}

function sourceEvidenceMatches(skill: Skill, record: SkillRecord) {
  return hashOf(skill.binding) === hashOf(record.binding) && hashOf(skill.evidence) === hashOf(record.evidence);
}

function sourceMatches(skill: Skill, record: SkillRecord) {
  const ids = record.kitSource!.joints.map((joint) => joint.id);

  return (
    skillHash(skill) === record.hash &&
    sourceEvidenceMatches(skill, record) &&
    skill.origin?.method === 'motor-kit' &&
    skill.name === record.name &&
    hashOf(skill.observation) === hashOf(policyObservation(ids)) &&
    skill.action.kind === 'position-offset'
  );
}

export interface LocalKitPreparation {
  model: SimModel;
  record: SkillRecord;
  skill: unknown;
}

export function prepareKitWarm({ model, record, skill }: LocalKitPreparation): KitWarm | undefined {
  try {
    if (!isProvenSkill(skill, record.kitSource!) || !sourceMatches(skill, record)) return;

    if (skill.controller.kind !== 'policy' || !isTrainablePolicy(skill.controller.policy)) return;

    const plan = mapKitSkill({ ...skill, controller: skill.controller }, record.kitSource!, model);

    return isTrainablePolicy(plan.warm.policy) ? { ...plan.warm, initialMinutes: 1 } : undefined;
  } catch {
    return;
  }
}

export async function localKitWarm(
  options: Target & {
    records: readonly SkillRecord[];
    load: (hash: string) => Promise<Skill | null>;
    signal?: AbortSignal;
    prepare?: (input: LocalKitPreparation) => Promise<KitWarm | undefined>;
    available?: () => Promise<boolean>;
  },
): Promise<KitWarm | undefined> {
  try {
    if (options.signal?.aborted) return;

    const record = selectKitSource(options.records, options);

    if (!record) return;

    if (options.available && !(await options.available())) return;

    if (options.signal?.aborted) return;

    const skill = await options.load(record.hash);

    if (options.signal?.aborted || !skill) return;

    const input = { model: options.model, record, skill };
    const warm = options.prepare ? await options.prepare(input) : prepareKitWarm(input);

    return options.signal?.aborted ? undefined : warm;
  } catch {
    return;
  }
}
