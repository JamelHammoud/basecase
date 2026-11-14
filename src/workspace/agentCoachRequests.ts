import type { SimModel } from '../sim/mjcfTypes';
import type { CoachBrief } from '../skills/coach';
import { coachPrompt, readRevision } from '../skills/coachPrompt';
import { kitEnvironment } from '../skills/kitEnvironment';
import { skillRows, type SkillRow } from '../skills/skillRows';
import { coachReward, type CoachReport } from '../skills/skillsCoach';
import { designOf } from '../skills/skillsRuntime';
import type { SkillToolContext } from './agentSkillRequests';

type Payload = Record<string, unknown>;

const coachable = (row: SkillRow) => !!row.kit && row.state.kind === 'ready' && !!row.record;

function readyRows(model: SimModel, ctx: SkillToolContext) {
  return skillRows({
    model,
    design: designOf(model),
    records: ctx.project().skills ?? [],
    jobs: ctx.skills.runtime.jobs,
    animations: ctx.project().animations,
  }).filter(coachable);
}

function briefText(brief: CoachBrief, words: string) {
  return [
    coachPrompt(brief, words),
    '',
    'Call coach_skill again with skill, words, reward (the whole revised program), signal and direction (up or down). The contract, the observation and the action stay as Arena proved them. Training starts from this skill, and the result is kept only if Arena passes the same contract and the signal moves at least its minimum.',
  ].join('\n');
}

async function subjectOf(row: SkillRow, model: SimModel, ctx: SkillToolContext) {
  const skill = await ctx.skills.runtime.loadSkill(row.record!.hash);

  if (!skill) return null;

  const entry = row.kit!;

  return { skill, entry, environment: kitEnvironment(model, entry), reward: coachReward(model, row.record!, entry) };
}

export function namedRow(rows: SkillRow[], skill: unknown, none: string): { row: SkillRow } | { text: string } {
  const name = String(skill ?? '')
    .trim()
    .toLowerCase();
  const row = rows.find((r) => r.label.toLowerCase() === name);

  if (row) return { row };

  return {
    text: rows.length
      ? `No ready skill named "${String(skill)}". Ready: ${rows.map((r) => r.label).join(', ')}.`
      : none,
  };
}

export const missingSkill = (row: SkillRow) => `${row.label}’s skill file is missing. Train it again.`;

export async function coachRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Coaching a skill');

  const model = await ctx.skills.buildModel();
  const rows = readyRows(model, ctx);
  const found = namedRow(
    rows,
    payload.skill,
    'Coaching changes a ready Motor Kit skill, and none is ready. Train one first.',
  );
  const words = String(payload.words ?? '');

  if ('text' in found) return found;

  const { row } = found;
  const subject = await subjectOf(row, model, ctx);

  if (!subject) return { text: missingSkill(row) };

  const { coach } = ctx.skills.runtime;

  if (typeof payload.reward !== 'string') return { text: briefText(await coach.brief(model, subject), words) };

  const { reward, signal, direction } = payload;
  const read = readRevision(JSON.stringify({ reward, signal, direction }), subject.reward);

  if (!read.ok) return { text: `Change the revision: ${read.reason}` };

  const brief = coach.briefOf(subject.skill) ?? (await coach.brief(model, subject));
  const job = { ...subject, design: designOf(model), brief, revision: read.revision, words };
  const refused = coach.start(model, job, { target: row.target, label: row.label });

  return {
    text:
      refused ??
      `Coaching ${row.label} in Forge from the ready skill; Arena judges the result on the same contract. Follow it with list_skills.`,
  };
}

export const coachLines = (report: CoachReport) => [
  `Last coaching, “${report.name}”:`,
  ...report.lines.map((l) => `- ${l}`),
];
