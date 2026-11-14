import { recordEnvironment } from '../skills/skillRecords';
import { skillRows, type SkillRow } from '../skills/skillRows';
import { designOf } from '../skills/skillsRuntime';
import { MIN_STRESS_BUDGET, STRESS_BUDGET } from '../skills/stress';
import { stressText } from '../skills/stressWords';
import { missingFileText, noRowText } from './agentCoachRequests';
import type { SkillToolContext } from './agentSkillRequests';

type Payload = Record<string, unknown>;

const MAX_BUDGET = 400;

const budgetOf = (raw: unknown) => {
  const n = Number(raw);

  return Number.isFinite(n) ? Math.max(MIN_STRESS_BUDGET, Math.min(MAX_BUDGET, Math.round(n))) : STRESS_BUDGET;
};

const ready = (row: SkillRow) => row.state.kind === 'ready' && !!row.record;

export async function stressRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Stress testing a skill');

  const model = await ctx.skills.buildModel();
  const animations = ctx.project().animations ?? [];
  const rows = skillRows({
    model,
    design: designOf(model),
    records: ctx.project().skills ?? [],
    jobs: ctx.skills.runtime.jobs,
    animations,
  }).filter(ready);
  const name = String(payload.skill ?? '')
    .trim()
    .toLowerCase();
  const row = rows.find((r) => r.label.toLowerCase() === name);

  if (!row) return { text: noRowText(rows, payload.skill, 'Stress tests a ready skill') };

  const { runtime } = ctx.skills;
  const skill = await runtime.loadSkill(row.record!.hash);
  const environment = recordEnvironment(row.record!, model, animations);

  if (!skill || !environment) return { text: missingFileText(row) };

  const refused = runtime.stress.run(model, row, { skill, environment, budget: budgetOf(payload.budget) });

  if (refused) return { text: refused };

  await runtime.settled();

  const report = runtime.stress.reportOf(row.target);

  return { text: report ? stressText(row.label, report.result) : 'Stress stopped before it finished.' };
}
