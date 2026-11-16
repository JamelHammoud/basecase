import { hubBridge } from '../hub/hubBridge';
import type { SimModel } from '../sim/mjcfTypes';
import { workerClient } from '../utils/workerRpc';
import { robotSchema } from './robotSchema';
import { kitRobot } from './kitModel';
import type { RankedSkill } from './skillRank';
import type { SKILL_RANK_HANDLERS } from './skillRankJob';

const ranking = workerClient<typeof SKILL_RANK_HANDLERS>(
  () => new Worker(new URL('./skillRank.worker.ts', import.meta.url), { type: 'module' }),
  () => import('./skillRankJob').then((m) => m.SKILL_RANK_HANDLERS),
);

export async function findSkills(model: SimModel, query = ''): Promise<RankedSkill[]> {
  try {
    const robot = kitRobot(model);
    const target = robotSchema(model, { robot: robot.key, joints: robot.joints });
    const [candidates, outcomes] = await Promise.all([
      hubBridge.findSkills(),
      hubBridge.skillOutcomes().catch(() => []),
    ]);
    const ranked = await ranking.call('rank', { candidates, target, outcomes });
    const words = query.trim().toLowerCase().split(/\s+/);

    return ranked.filter((r) => words.every((word) => `${r.name} ${r.repo}`.toLowerCase().includes(word)));
  } catch {
    return [];
  }
}
