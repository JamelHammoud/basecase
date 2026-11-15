import { reply } from '../utils/workerRpc';
import { rankSkills, type SkillCandidate } from './skillRank';
import type { RobotSchema } from './robotSchema';

export const SKILL_RANK_HANDLERS = {
  rank: ({ candidates, target }: { candidates: SkillCandidate[]; target: RobotSchema }) =>
    reply(rankSkills(candidates, target)),
};
