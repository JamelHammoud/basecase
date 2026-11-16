import { reply } from '../utils/workerRpc';
import { rankSkills, type SkillCandidate } from './skillRank';
import type { RobotSchema } from './robotSchema';

export const SKILL_RANK_HANDLERS = {
  rank: ({
    candidates,
    target,
    outcomes,
  }: {
    candidates: SkillCandidate[];
    target: RobotSchema;
    outcomes?: unknown[];
  }) => reply(rankSkills(candidates, target, outcomes)),
};
