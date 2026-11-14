import { buildEye, type Eye } from '../sim/eyes';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotAnimation, ScenePart } from '../types/robotics';
import type { Contract } from '../skills/contract';
import type { SignalSource, StartArea } from '../skills/environment';
import type { TrainedEntry } from '../skills/kitEnvironment';
import type { V3 } from '../skills/kitModel';
import { moveAnimations } from '../skills/moveEnvironment';
import { kitEntries } from '../skills/motorKit';
import type { Rollout } from '../skills/rollout';
import type { SkillRecord } from '../skills/skillRecords';
import { skillRows, type SkillRow } from '../skills/skillRows';
import { designOf, type SkillsRuntime } from '../skills/skillsRuntime';
import type { DraftGoal } from '../skills/teachEnvironment';
import type { DraftInput, DraftReport } from '../skills/teach';
import { coachLines, coachRequest } from './agentCoachRequests';

export interface SkillToolContext {
  skills: { runtime: SkillsRuntime; buildModel: () => Promise<SimModel> };
  parts?: () => ScenePart[];
  project: () => { skills?: SkillRecord[]; animations?: RobotAnimation[] };
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

function startAreaOf(raw: unknown): StartArea | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const p = raw as Payload;
  const range = (v: unknown): [number, number] => (Array.isArray(v) ? [Number(v[0] ?? 0), Number(v[1] ?? 0)] : [0, 0]);

  return { forwardM: range(p.forward_m), sideM: range(p.side_m) };
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
    startArea: startAreaOf(p.start_area),
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

function eyeFor(raw: unknown, model: SimModel, parts: ScenePart[]): Eye | string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const p = raw as Payload;
  const name = String(p.part ?? '');
  const part = parts.find((x) => x.id === name) ?? parts.find((x) => x.name.toLowerCase() === name.toLowerCase());

  if (!part) return `No camera part "${name}".`;

  return buildEye(model, parts, {
    part: part.id,
    cols: p.cols as number | undefined,
    rows: p.rows as number | undefined,
    rangeM: p.range_m as number | undefined,
  });
}

async function draftRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Drafting a skill');

  const model = await ctx.skills.buildModel();
  const eye = eyeFor(payload.eye, model, ctx.parts?.() ?? []);

  if (typeof eye === 'string') return { text: `Change the draft: ${eye}` };

  const result = await ctx.skills.runtime.draft(model, { ...draftInput(payload), eye });

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

function trainMoveRequest(model: SimModel, name: string, ctx: SkillToolContext) {
  const moves = moveAnimations(model, ctx.project().animations ?? []);
  const move = moves.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());

  if (!move)
    return moves.length
      ? `No move named "${name}". Moves: ${moves.map((a) => a.name).join(', ')}.`
      : 'Moves are Pose-tab animations of a robot that walks on legs. Animate one first.';

  return (
    ctx.skills.runtime.trainMove(model, move) ?? `Training the move ${move.name} in Forge. Follow it with list_skills.`
  );
}

async function trainRequest(payload: Payload, ctx: SkillToolContext) {
  ctx.setAction('Starting training');

  const model = await ctx.skills.buildModel();

  if (typeof payload.kit === 'string') return { text: trainKitRequest(model, payload.kit, ctx) };

  if (typeof payload.move === 'string') return { text: trainMoveRequest(model, payload.move, ctx) };

  if (typeof payload.draft !== 'string') return { text: 'Pass draft (from draft_skill), kit or move.' };

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

function rowKind(row: SkillRow): string {
  if (row.kit) return ' (Motor Kit)';

  return row.move ? ' (move)' : '';
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
    animations: ctx.project().animations,
  });
  const race = ctx.skills.runtime.lastRace;
  const lines = rows.length
    ? rows.map((r) => `- ${r.label}${rowKind(r)}: ${stateText(r)}`)
    : ['No skills. Teach one with draft_skill.'];

  if (race) lines.push(...raceLines(race));

  if (ctx.skills.runtime.coach.last) lines.push(...coachLines(ctx.skills.runtime.coach.last));

  return { text: lines.join('\n') };
}

export const SKILL_HANDLERS = {
  skill_draft: draftRequest,
  skill_train: trainRequest,
  skill_list: listRequest,
  skill_coach: coachRequest,
};
