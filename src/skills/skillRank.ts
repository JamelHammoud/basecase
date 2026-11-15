import type { HubSkillCandidate } from '../hub/hubBridge';
import type { ArenaEvidence, Skill } from './artifacts';
import { ARENA } from './arena';
import { clopperPearsonLower } from './arenaStats';
import { isSkill } from './bundle';
import { hashOf } from './hash';
import { isRunnablePolicy } from './policyCheck';
import { isRobotSchema, jointMap, type JointMap, type RobotSchema } from './robotSchema';

export type SkillCandidate = HubSkillCandidate;

export interface RankedSkill {
  repo: string;
  revision: string;
  name: string;
  fit: JointMap;
  distance: number | null;
  passes: number;
}

const same = (a: unknown, b: unknown) => hashOf(a) === hashOf(b);

function validEvidence(evidence: ArenaEvidence, skill: Skill) {
  const variants = ARENA.variants;

  return (
    evidence.passed &&
    evidence.arenaVersion === ARENA.version &&
    evidence.confidence === ARENA.confidence &&
    evidence.bar === ARENA.bar &&
    ['physics', 'actuators', 'contract'].every((key) =>
      same(evidence.binding[key as keyof typeof evidence.binding], skill.binding[key as keyof typeof skill.binding]),
    ) &&
    evidence.variants.length === variants.length &&
    evidence.variants.every(
      (v, i) =>
        v?.variant === variants[i] &&
        Number.isInteger(v.passes) &&
        v.trials === ARENA.trials &&
        v.passes >= 0 &&
        v.passes <= v.trials &&
        clopperPearsonLower(v.passes, v.trials, ARENA.confidence) >= ARENA.bar,
    )
  );
}

function validSkill(skill: unknown, schema: RobotSchema): skill is Skill {
  return (
    isSkill(skill) &&
    skill.controller.kind === 'policy' &&
    isRunnablePolicy(skill.controller.policy) &&
    !!skill.evidence &&
    validEvidence(skill.evidence, skill) &&
    hashOf(skill.observation) === skill.binding.observation &&
    hashOf(skill.action) === skill.binding.action &&
    same(
      schema.joints.map((j) => j.id),
      skill.action.joints,
    ) &&
    same(skill.controller.policy.joints, skill.action.joints)
  );
}

function anchorDistance(source: RobotSchema, target: RobotSchema, map: number[]) {
  const distances = target.limbs.map((anchor, limb) => {
    const joint = target.joints.findIndex((j) => j.limb === limb);
    const matched = source.limbs[source.joints[map[joint]].limb];

    return Math.hypot(anchor[0] - matched[0], anchor[1] - matched[1]);
  });

  return distances.reduce((sum, distance) => sum + distance, 0) / Math.max(1, distances.length);
}

function ranked(candidate: SkillCandidate, target: RobotSchema): RankedSkill | null {
  try {
    const skill: unknown = JSON.parse(candidate.files['skill.json']);
    const schema: unknown = JSON.parse(candidate.files['robot.json']);

    if (!isRobotSchema(schema) || !validSkill(skill, schema)) return null;

    const fit = jointMap(schema, target);

    return {
      repo: candidate.repo,
      revision: candidate.revision,
      name: skill.name,
      fit,
      distance: fit.ok ? anchorDistance(schema, target, fit.map) : null,
      passes: skill.evidence!.variants.reduce((sum, v) => sum + v.passes, 0),
    };
  } catch {
    return null;
  }
}

const compareText = (a: string, b: string) => (a < b ? -1 : Number(a > b));

export function rankSkills(candidates: SkillCandidate[], target: RobotSchema): RankedSkill[] {
  return candidates
    .flatMap((candidate) => ranked(candidate, target) ?? [])
    .sort(
      (a, b) =>
        Number(b.fit.ok) - Number(a.fit.ok) ||
        (a.distance ?? 0) - (b.distance ?? 0) ||
        b.passes - a.passes ||
        compareText(a.repo, b.repo) ||
        compareText(a.revision, b.revision),
    );
}
