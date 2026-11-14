import type { SimModel } from '../sim/mjcfTypes';
import { recordEnvironment } from '../skills/skillRecords';
import { skillRows, type SkillRow } from '../skills/skillRows';
import { designOf } from '../skills/skillsRuntime';
import { stressLines, type StressReport } from '../skills/skillsStress';
import { kitEnvironment } from '../skills/kitEnvironment';
import { moveEnvironment } from '../skills/moveEnvironment';
import { MIN_STRESS_BUDGET, STRESS_BUDGET } from '../skills/stressSearch';
import type { SkillToolContext } from './agentSkillRequests';

type Payload = Record<string, unknown>;

const MAX_AGENT_BUDGET = 400;

function readyRows(model: SimModel, ctx: SkillToolContext) {
  return skillRows({
    model,
    design: designOf(model),
    records: ctx.project().skills ?? [],
    jobs: ctx.skills.runtime.jobs,
    animations: ctx.project().animations,
  }).filter((r) => r.state.kind === 'ready' && !!r.record);
}

function environmentOf(row: SkillRow, model: SimModel, ctx: SkillToolContext) {
  if (row.kit) return kitEnvironment(model, row.kit);

  if (row.move) return moveEnvironment(model, row.move);

  return recordEnvironment(row.record!, model, ctx.project().animations ?? []);
}

function budgetOf(raw: unknown) {
  const n = Number(raw);

  return Number.isFinite(n) ? Math.min(MAX_AGENT_BUDGET, Math.max(MIN_STRESS_BUDGET, Math.round(n))) : STRESS_BUDGET;
}

export async function stressRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Stressing a skill');

  const model = await ctx.skills.buildModel();
  const rows = readyRows(model, ctx);
  const name = String(payload.skill ?? '')
    .trim()
    .toLowerCase();
  const row = rows.find((r) => r.label.toLowerCase() === name);

  if (!row)
    return {
      text: rows.length
        ? `No ready skill named "${String(payload.skill)}". Ready: ${rows.map((r) => r.label).join(', ')}.`
        : 'Stress tests a ready skill, and none is ready. Train one first.',
    };

  const { runtime } = ctx.skills;
  const skill = await runtime.loadSkill(row.record!.hash);
  const environment = environmentOf(row, model, ctx);

  if (!skill || !environment) return { text: `${row.label}’s skill file is missing. Train it again.` };

  const budget = runtime.stress.budget;

  runtime.stress.budget = budgetOf(payload.budget);

  const refused = runtime.stress.start(model, { skill, environment }, { target: row.target, label: row.label });

  runtime.stress.budget = budget;

  if (refused) return { text: refused };

  await runtime.settled();

  const { hash } = row.record!;
  const result = runtime.stress.resultOf(hash);

  if (result) return { text: [`${row.label}:`, ...stressLines(result)].join('\n') };

  return { text: runtime.stress.failureOf(hash) ?? 'Stopped before it finished.' };
}

export const stressReportLines = (report: StressReport) => [
  `Last stress test or Train on These, “${report.name}”:`,
  ...report.lines.map((l) => `- ${l}`),
];
