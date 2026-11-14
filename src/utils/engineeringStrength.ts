import type { ChainResult, FastenerChain } from '../assembly/assemblyTypes';
import { LAYERED } from '../strength/material';
import { FACTOR_PASS, FACTOR_WARN, type ScrewLine, type StrengthJob, type StrengthReading } from '../strength/types';
import type { ScenePart } from '../types/robotics';
import { isPrinted, printMaterialOf } from './bom';
import { jointLabel } from './engineeringFormat';
import { torque } from './torque';
import { dot, norm, sub, type V3 } from './engineeringMath';
import type { CheckContext, CheckRow, JointLoad, ServoLine } from './engineeringTypes';

export const STRENGTH_CHECK = 'Strength';

const HORN_REACH_MM = 12;
const PARALLEL = 0.9;
const MAX_HOPS = 3;
const BETTER_BY = 1.1;

interface PathPart {
  part: ScenePart;
  inScrews: FastenerChain[];
  outScrews: FastenerChain[];
}

export interface StrengthPlan {
  job: StrengthJob;
  load: JointLoad;
  torqueNm: number;
}

const touching = (c: FastenerChain) => new Set([...c.stack, ...(c.endsIn.id ? [c.endsIn.id] : [])]);

function offAxis(point: V3, line: ServoLine): number {
  const rel = sub(point, line.point);
  const a = norm(line.axis);
  const along = dot(rel, a);

  return Math.hypot(rel[0] - along * a[0], rel[1] - along * a[1], rel[2] - along * a[2]);
}

const isHornScrew = (c: FastenerChain, servo: string, out: ServoLine) =>
  touching(c).has(servo) &&
  Math.abs(dot(norm(c.axis as V3), norm(out.axis))) > PARALLEL &&
  offAxis(c.tip as V3, out) <= HORN_REACH_MM;

const lineOf = (c: FastenerChain): ScrewLine => ({
  from: c.tip as V3,
  to: c.top as V3,
  radius: Math.max(c.headR, c.d),
});

function bearsLoad(ctx: CheckContext, p: ScenePart | undefined): p is ScenePart {
  return !!p && isPrinted(p) && !!LAYERED[printMaterialOf(p, ctx.project)];
}

const joinsOthers = (ctx: CheckContext, c: FastenerChain, id: string) =>
  [...touching(c)].some((other) => other !== id && ctx.byPart.get(other)?.kind !== 'hardware');

function nextHops(ctx: CheckContext, from: PathPart, seen: Set<string>): Map<string, FastenerChain[]> {
  const out = new Map<string, FastenerChain[]>();

  for (const c of from.outScrews)
    for (const id of touching(c)) {
      if (seen.has(id) || !bearsLoad(ctx, ctx.byPart.get(id))) continue;

      out.set(id, [...(out.get(id) ?? []), c]);
    }

  return out;
}

function loadPath(ctx: CheckContext, chains: FastenerChain[], horn: FastenerChain[]): PathPart[] {
  const seen = new Set<string>();
  const path: PathPart[] = [];
  let frontier = new Map<string, FastenerChain[]>();

  for (const c of horn)
    for (const id of touching(c))
      if (bearsLoad(ctx, ctx.byPart.get(id))) frontier.set(id, [...(frontier.get(id) ?? []), c]);

  for (let hop = 0; hop < MAX_HOPS && frontier.size; hop++) {
    const next = new Map<string, FastenerChain[]>();

    for (const [id, inScrews] of frontier) {
      seen.add(id);

      const outScrews = chains.filter((c) => !inScrews.includes(c) && touching(c).has(id) && joinsOthers(ctx, c, id));

      if (!outScrews.length) continue;

      const step = { part: ctx.byPart.get(id)!, inScrews, outScrews };

      path.push(step);
      nextHops(ctx, step, seen).forEach((screws, to) => next.set(to, [...(next.get(to) ?? []), ...screws]));
    }

    frontier = next;
  }

  return path;
}

function torqueOf(ctx: CheckContext, load: JointLoad): number {
  const walk = ctx.input.walk;
  const p99 = typeof walk === 'object' ? (walk.joints[load.joint.id]?.p99Nm ?? 0) : 0;

  return Math.max(load.loadNm, p99);
}

function jobsFor(ctx: CheckContext, chains: ChainResult, load: JointLoad): StrengthPlan[] {
  const servos = load.joint.actuators ?? [];
  const torqueNm = torqueOf(ctx, load) / Math.max(1, servos.length);

  if (Number.isNaN(torqueNm) || torqueNm <= 0) return [];

  return servos.flatMap((servo) => {
    const out = ctx.input.servoOutputs[servo];
    const horn = out ? chains.screws.filter((c) => isHornScrew(c, servo, out)) : [];

    return loadPath(ctx, chains.screws, horn).map(({ part, inScrews, outScrews }) => ({
      load,
      torqueNm,
      job: {
        key: `${load.joint.id}|${servo}|${part.id}`,
        part: part.id,
        material: printMaterialOf(part, ctx.project),
        infillPct: ctx.project.infillPct,
        down: ctx.input.printDowns?.[part.id] ?? part.print?.down,
        load: { origin: out!.point, axis: norm(out!.axis), torqueNmm: torqueNm * 1000, screws: inScrews.map(lineOf) },
        holds: outScrews.map(lineOf),
      },
    }));
  });
}

export function strengthPlans(ctx: CheckContext, loads: JointLoad[]): StrengthPlan[] {
  const chains = ctx.input.chains;

  if (!chains?.screws.length) return [];

  return loads.flatMap((load) => jobsFor(ctx, chains, load));
}

export const fmtFactor = (f: number) =>
  f >= 10 ? String(Math.min(99, Math.floor(f))) : (Math.floor(f * 10) / 10).toFixed(1);

const statusOf = (factor: number): CheckRow['status'] => {
  if (factor >= FACTOR_PASS) return 'pass';

  return factor >= FACTOR_WARN ? 'warn' : 'fail';
};

interface PartVerdict {
  plan: StrengthPlan;
  reading: StrengthReading;
}

function worstByPart(plans: StrengthPlan[], readings: Array<StrengthReading | null>): PartVerdict[] {
  const byPart = new Map<string, PartVerdict>();

  plans.forEach((plan, i) => {
    const reading = readings[i];
    const known = byPart.get(plan.job.part);

    if (reading && (!known || reading.factor < known.reading.factor)) byPart.set(plan.job.part, { plan, reading });
  });

  return [...byPart.values()].sort((a, b) => a.reading.factor - b.reading.factor);
}

function itemOf(ctx: CheckContext, { plan, reading }: PartVerdict) {
  const name = ctx.byPart.get(plan.job.part)?.name ?? plan.job.part;
  const better = reading.best.factor > reading.factor * BETTER_BY;

  return {
    text: `${name}: ${fmtFactor(reading.factor)}×, ${torque(plan.torqueNm)} (${jointLabel(plan.load.joint)})`,
    ids: [plan.job.part],
    status: statusOf(reading.factor) === 'fail' ? ('fail' as const) : ('warn' as const),
    fix: better ? { kind: 'print-face' as const, part: plan.job.part, down: reading.best.down } : undefined,
  };
}

export function strengthRows(ctx: CheckContext, loads: JointLoad[]): CheckRow[] {
  const plans = ctx.input.strength ? strengthPlans(ctx, loads) : [];

  if (!plans.length) return [];

  const verdicts = worstByPart(plans, ctx.input.strength!(plans.map((p) => p.job)));

  if (!verdicts.length) return [];

  const flagged = verdicts.filter((v) => statusOf(v.reading.factor) !== 'pass');

  return [
    {
      check: STRENGTH_CHECK,
      status: statusOf(verdicts[0].reading.factor),
      detail: `${fmtFactor(verdicts[0].reading.factor)}×`,
      detailInItems: true,
      items: flagged.map((v) => itemOf(ctx, v)),
      ids: verdicts.map((v) => v.plan.job.part),
    },
  ];
}
