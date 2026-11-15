import type { Skill } from './artifacts';
import { LEGGED_ENTRIES, type TrainedEntry } from './kitEnvironment';
import { kitSkillName } from './motorKit';
import { jointMap, type JointMap, type RobotSchema } from './robotSchema';
import { errorMessage } from '../utils/errorMessage';
import { policyMapProblem } from './policyMap';

export function kitEntryOf(skill: Skill): TrainedEntry {
  const entry = LEGGED_ENTRIES.find((e) => kitSkillName(e) === skill.name);

  if (!entry || skill.origin?.method !== 'motor-kit')
    throw new Error('Install Skill takes Motor Kit skills: Stand, Walk, Get up and Settle.');

  return entry;
}

export function skillFit(skill: Skill, source: RobotSchema, target: RobotSchema): JointMap {
  try {
    kitEntryOf(skill);

    const fit = jointMap(source, target);

    if (!fit.ok) return fit;

    if (!target.floating || target.bodyClass !== 'legged')
      throw new Error('The Motor Kit trains robots that walk on legs.');

    if (skill.controller.kind !== 'policy') throw new Error('Only a skill that runs a policy can be installed.');

    const problem = policyMapProblem(skill.controller.policy);

    if (problem) throw new Error(problem);

    return fit;
  } catch (error) {
    return { ok: false, problem: errorMessage(error) };
  }
}
