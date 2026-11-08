import type { SimModel } from '../sim/mjcfTypes';
import type { Contract } from '../skills/contract';
import type { SignalSource } from '../skills/environment';
import type { TrainedEntry } from '../skills/kitEnvironment';
import type { V3 } from '../skills/kitModel';
import { kitEntries } from '../skills/motorKit';
import type { Rollout } from '../skills/rollout';
import type { SkillRecord } from '../skills/skillRecords';
import { skillRows, type SkillRow } from '../skills/skillRows';
import { designOf, type SkillsRuntime } from '../skills/skillsRuntime';
import type { DraftGoal } from '../skills/teachEnvironment';
import type { DraftInput, DraftReport } from '../skills/teach';

export interface SkillToolContext {
  skills: { runtime: SkillsRuntime; buildModel: () => Promise<SimModel> };
  project: () => { skills?: SkillRecord[] };
  setAction: (action: string) => void;
}

type Payload = Record<string, unknown>;

const KIT_NAMES: Record<string, TrainedEntry> = {
  stand: 'stand',
  walk: 'velocity-tracking',
  'get-up': 'get-up',
  settle: 'settle-to-neutral',
};

const FORGE_STEPS_PER_S = 40000;

function goalOf(raw: Payload | undefined): DraftGoal {
  if (raw?.kind === 'velocity') {
    const command: V3 = [Number(raw.forward_mps ?? 0), Number(raw.left_mps ?? 0), Number(raw.turn_radps ?? 0)];

    return { kind: 'velocity', command };
  }

  if (raw?.kind === 'reach') return raw as unknown as DraftGoal;

  return { kind: 'open' };
}

export function draftInput(p: Payload): DraftInput {
  const contract = (p.contract ?? {}) as { success?: unknown; failures?: unknown };

  return {
    name: String(p.name ?? ''),
    request: String(p.request ?? ''),
    goal: goalOf(p.goal as Payload | undefined),
    seconds: Number(p.seconds),
    contract: { version: 1, success: contract.success, failures: contract.failures ?? [] } as Contract,
    signals: p.signals as Record<string, SignalSource> | undefined,
    rewards: p.rewards as string[] | undefined,
    analysis: {
      quasiStatic: p.quasi_static as boolean | undefined,
      motionShapeMatters: p.motion_shape_matters as boolean | undefined,
      contactRich: p.contact_rich as boolean | undefined,
    },
  };
}

const rolloutLine = (r: Rollout) =>
  `- ${r.label}: ${r.passed ? 'passes' : 'fails'} (margin ${r.margin.toFixed(2)}${r.failed.length ? `; failed: ${r.failed.join(', ')}` : ''}${r.diverged ? '; the sim diverged' : ''})`;

function draftText(report: DraftReport): string {
  const { draft, route } = report;

  return [
    `Draft ${draft.id} for “${draft.name}”.`,
    'Contract:',
    ...report.words.map((w) => `- ${w}`),
    `Solver first tried: ${route.method}. ${route.reason}`,
    'Nominal rollouts, one try each:',
    ...report.rollouts.map(rolloutLine),
    ...report.warnings.map((w) => `Warning: ${w}`),
    ...(report.relaxation ? [`Design change that would lift the limit: ${report.relaxation}`] : []),
    `Show the user the contract in words and these rollouts, then ask before train_skill draft "${draft.id}".`,
  ].join('\n');
}

async function draftRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Drafting a skill');

  const result = await ctx.skills.runtime.draft(await ctx.skills.buildModel(), draftInput(payload));

  return { text: result.ok ? draftText(result.report) : `Change the draft: ${result.problems.join(' ')}` };
}

function trainKitRequest(model: SimModel, kit: string, ctx: SkillToolContext) {
  const entry = KIT_NAMES[kit];

  if (!entry || !kitEntries(model).includes(entry))
    return 'The Motor Kit is for robots that walk on legs. Teach this robot with draft_skill instead.';

  return (
    ctx.skills.runtime.trainKit(model, entry) ??
    `Training the Motor Kit’s ${kit} in the background. Follow it with list_skills.`
  );
}

async function trainRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Starting training');

  const model = await ctx.skills.buildModel();

  if (typeof payload.kit === 'string') return { text: trainKitRequest(model, payload.kit, ctx) };

  if (typeof payload.draft !== 'string') return { text: 'Pass draft (from draft_skill) or kit.' };

  const minutes = Number(payload.budget_minutes);
  const budget = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * FORGE_STEPS_PER_S : undefined;
  const refused = ctx.skills.runtime.race(model, payload.draft, budget);

  return {
    text:
      refused ??
      'Racing solvers on the draft in the background; Arena judges every result. Follow it with list_skills.',
  };
}

function stateText(row: SkillRow): string {
  const { state } = row;

  if (state.kind === 'ready') return `ready, ${state.arena}`;

  if (state.kind === 'recheck') return 'needs an Arena recheck after a design change';

  if (state.kind === 'untrained') return 'needs training';

  const share = state.share === null ? '' : ` ${Math.round(state.share * 100)}%`;

  return `${state.background ? 'retraining in the background' : 'training'}${share} (${state.message})`;
}

function raceLines(race: NonNullable<SkillsRuntime['lastRace']>): string[] {
  return [
    `Last race, “${race.name}”:`,
    ...race.lines.map((l) => `- ${l}`),
    ...(race.relaxation ? [`Offer this design change: ${race.relaxation}`] : []),
  ];
}

async function listRequest(_payload: Payload, ctx: SkillToolContext) {
  const model = await ctx.skills.buildModel();
  const rows = skillRows({
    model,
    design: designOf(model),
    records: ctx.project().skills ?? [],
    jobs: ctx.skills.runtime.jobs,
  });
  const race = ctx.skills.runtime.lastRace;
  const lines = rows.length
    ? rows.map((r) => `- ${r.label}${r.kit ? ' (Motor Kit)' : ''}: ${stateText(r)}`)
    : ['No skills. Teach one with draft_skill.'];

  if (race) lines.push(...raceLines(race));

  return { text: lines.join('\n') };
}

export const SKILL_HANDLERS = {
  skill_draft: draftRequest,
  skill_train: trainRequest,
  skill_list: listRequest,
};
