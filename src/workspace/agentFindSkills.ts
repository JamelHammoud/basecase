import { findSkills } from '../skills/findSkills';
import type { SimModel } from '../sim/mjcfTypes';

export async function findSkillsRequest(
  payload: Record<string, unknown>,
  ctx: { skills: { buildModel: () => Promise<SimModel> } },
) {
  const model = await ctx.skills.buildModel();

  return { skills: await findSkills(model, String(payload.query ?? '')) };
}
