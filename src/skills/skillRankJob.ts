import { reply } from '../utils/workerRpc';
import { rankSkills, type SkillCandidate } from './skillRank';
import type { RobotSchema } from './robotSchema';
import type { SimModel } from '../sim/mjcfTypes';
import { installPlan, readPublishedSkill } from './hubSkill';
import { produceInstallOutcome } from './installOutcome';
import { prepareKitWarm, type LocalKitPreparation } from './localKitSource';

export const SKILL_RANK_HANDLERS = {
  prepareLocalKit: (input: LocalKitPreparation) => reply(prepareKitWarm(input)),
  installOutcome: (options: Parameters<typeof produceInstallOutcome>[0]) => reply(produceInstallOutcome(options)),
  prepareInstall: ({ files, model }: { files: Record<string, unknown>; model: SimModel }) => {
    const published = readPublishedSkill(files);

    return reply({ published, plan: installPlan(published, model) });
  },
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
