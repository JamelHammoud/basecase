import { skillEnvironment } from '../skills/skillEnvironment';
import { skillRows, type SkillRow } from '../skills/skillRows';
import { designOf } from '../skills/skillsRuntime';
import { stressLines } from '../skills/stressText';
import { STOPPED } from '../skills/skillsClient';
import type { SkillToolContext } from './agentSkillRequests';
import { missingSkill, namedRow } from './agentCoachRequests';

type Payload = Record<string, unknown>;

const ready = (row: SkillRow) => row.state.kind === 'ready' && !!row.record;

export async function stressRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Stressing a skill');

  const model = await ctx.skills.buildModel();
  const { runtime } = ctx.skills;
  const animations = ctx.project().animations ?? [];
  const rows = skillRows({
    model,
    design: designOf(model),
    records: ctx.project().skills ?? [],
    jobs: runtime.jobs,
    animations,
  }).filter(ready);
  const found = namedRow(rows, payload.skill, 'Stress tests a ready skill, and none is ready. Train one first.');

  if ('text' in found) return found;

  const { row } = found;
  const skill = await runtime.loadSkill(row.record!.hash);
  const environment = skill ? skillEnvironment(row, { model, runtime, animations }) : null;

  if (!skill || !environment) return { text: missingSkill(row) };

  const refused = runtime.stress.start(model, row, { skill, environment, entry: row.kit });

  if (refused) return { text: refused };

  await runtime.settled();

  const state = runtime.stress.of(row.target, row.record!.hash);

  return { text: state ? [`${row.label}:`, ...stressLines(state.result)].join('\n') : STOPPED };
}
