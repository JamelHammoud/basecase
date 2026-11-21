import type { SimModel } from '../sim/mjcfTypes';
import { ARENA } from './arena';
import { clopperPearsonLower } from './arenaStats';
import {
  bindingFor,
  contractHash,
  currentDesign,
  skillHash,
  type ArenaEvidence,
  type Skill,
  type SkillBinding,
} from './artifacts';
import { environmentHash, type Environment } from './environment';
import { hashOf, isHash } from './hash';
import { isRobotSchema, jointMap, robotSchema, type RobotSchema } from './robotSchema';

export interface InstallSource {
  repo: string;
  revision: string;
  skill: Skill;
  schema: RobotSchema;
}

export interface InstallOutcome {
  format: 'basecase-install-outcome';
  version: 1;
  attempt: string;
  source: { repo: string; revision: string; skill: string; schema: string };
  target: { schema: RobotSchema; binding: SkillBinding; environment: Environment };
  status: 'passed' | 'failed' | 'cancelled' | 'infrastructure';
  evidence: ArenaEvidence | null;
}

export function produceInstallOutcome(options: {
  source: InstallSource;
  model: SimModel;
  environment: Environment;
  status: InstallOutcome['status'];
  evidence?: ArenaEvidence;
  attempt?: string;
}): InstallOutcome {
  const { source, model, environment, status, evidence } = options;

  return {
    format: 'basecase-install-outcome',
    version: 1,
    attempt: options.attempt ?? crypto.randomUUID(),
    source: {
      repo: source.repo,
      revision: source.revision,
      skill: skillHash(source.skill),
      schema: hashOf(source.schema),
    },
    target: {
      schema: robotSchema(model, { robot: environment.robot, joints: environment.action.joints }),
      binding: bindingFor(currentDesign({ design: 'installation', model, environment })),
      environment: structuredClone(environment),
    },
    status,
    evidence: evidence ? structuredClone(evidence) : null,
  };
}

function validCounts(variants: ArenaEvidence['variants']) {
  return (
    Array.isArray(variants) &&
    variants.length === ARENA.variants.length &&
    variants.every(
      (v, i) =>
        v.variant === ARENA.variants[i] &&
        v.trials === ARENA.trials &&
        Number.isInteger(v.passes) &&
        v.passes >= 0 &&
        v.passes <= v.trials,
    )
  );
}

function validArena(record: InstallOutcome) {
  const e = record.evidence;
  const { binding, environment, schema } = record.target;

  if (!e || e.arenaVersion !== ARENA.version || e.confidence !== ARENA.confidence || e.bar !== ARENA.bar) return false;

  const bound = ['physics', 'actuators', 'contract'] as const;
  const variants = e.variants;
  const counts = validCounts(variants);

  if (!counts) return false;

  const passed = variants.every((v) => clopperPearsonLower(v.passes, v.trials, ARENA.confidence) >= ARENA.bar);

  return (
    bound.every((k) => isHash(binding[k]) && e.binding[k] === binding[k]) &&
    isHash(binding.topology) &&
    contractHash(environment.contract) === binding.contract &&
    hashOf(environment.observation) === binding.observation &&
    hashOf(environment.action) === binding.action &&
    hashOf(schema.joints.map((j) => j.id)) === hashOf(environment.action.joints) &&
    environmentHash(environment) === e.binding.environment &&
    e.passed === passed &&
    record.status === (passed ? 'passed' : 'failed')
  );
}

const validAttempt = (attempt: unknown) => typeof attempt === 'string' && attempt.length > 0 && attempt.length <= 128;

function boundedSchema(value: unknown): value is RobotSchema {
  return (
    isRobotSchema(value) &&
    value.limbs.length <= value.joints.length &&
    value.joints.every((joint) => joint.depth > 0 && joint.depth <= value.joints.length)
  );
}

function relevant(value: unknown, source: InstallOutcome['source'], target: RobotSchema): value is InstallOutcome {
  const r = value as InstallOutcome;

  return (
    !!r &&
    r.format === 'basecase-install-outcome' &&
    r.version === 1 &&
    validAttempt(r.attempt) &&
    r.source.repo === source.repo &&
    r.source.revision === source.revision &&
    /^[a-f0-9]{40}$/.test(r.source.revision) &&
    r.source.skill === source.skill &&
    r.source.schema === source.schema &&
    boundedSchema(r.target.schema) &&
    jointMap(r.target.schema, target).ok &&
    jointMap(target, r.target.schema).ok &&
    validArena(r)
  );
}

function similarity(a: RobotSchema, b: RobotSchema) {
  const distance = b.limbs.reduce(
    (sum, anchor) => sum + Math.min(...a.limbs.map((other) => Math.hypot(anchor[0] - other[0], anchor[1] - other[1]))),
    0,
  );
  const count = Math.abs(a.limbs.length - b.limbs.length);

  return 1 / (1 + count + distance / Math.max(1, b.limbs.length));
}

export function reportedInstallScore(records: unknown[], source: InstallSource, target: RobotSchema): number {
  if (!records.length) return 0;

  const expected = {
    repo: source.repo,
    revision: source.revision,
    skill: skillHash(source.skill),
    schema: hashOf(source.schema),
  };
  const reports = new Map<string, InstallOutcome>();
  let total = 0;
  let weight = 2;

  for (const record of records) {
    try {
      if (!relevant(record, expected, target)) continue;

      reports.set(hashOf(record), record);
    } catch {
      continue;
    }
  }

  for (const [, record] of [...reports].sort(([a], [b]) => (a < b ? -1 : Number(a > b)))) {
    const relevance = similarity(record.target.schema, target);

    total += relevance * (record.status === 'passed' ? 1 : -1);
    weight += relevance;
  }

  return total / weight;
}
