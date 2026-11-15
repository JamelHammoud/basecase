import type { FastenerChain } from '../assembly/assemblyTypes';
import { FACTOR_PASS, FACTOR_WARN, type ScrewLine, type StrengthJob, type StrengthReading } from '../strength/types';
import { printMaterialOf } from './bom';
import { jointLabel } from './engineeringFormat';
import { torque } from './torque';
import { norm, type V3 } from './engineeringMath';
import { StrengthPaths } from './strengthPaths';
import type { CheckContext, CheckRow, JointLoad } from './engineeringTypes';

export const STRENGTH_CHECK = 'Strength';

const BETTER_BY = 1.1;

export interface StrengthPlan {
  job: StrengthJob;
  load: JointLoad;
  torqueNm: number;
}

const lineOf = (c: FastenerChain): ScrewLine => ({
  from: c.tip as V3,
  to: c.top as V3,
  radius: Math.max(c.headR, c.d),
});

function torqueOf(ctx: CheckContext, load: JointLoad): number {
  const walk = ctx.input.walk;
  const p99 = typeof walk === 'object' ? (walk.joints[load.joint.id]?.p99Nm ?? 0) : 0;

  return Math.max(load.loadNm, p99);
}

function jobsFor(ctx: CheckContext, paths: StrengthPaths, load: JointLoad): StrengthPlan[] {
  const servos = load.joint.actuators ?? [];
  const torqueNm = torqueOf(ctx, load) / Math.max(1, servos.length);

  if (Number.isNaN(torqueNm) || torqueNm <= 0) return [];

  return servos.flatMap((servo) => {
    const out = ctx.input.servoOutputs[servo];

    return (out ? paths.from(servo, out) : []).map(({ part, inScrews, outScrews }) => ({
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

  if (!chains?.screws.length || !loads.length) return [];

  const paths = new StrengthPaths(ctx, chains.screws);

  return loads.flatMap((load) => jobsFor(ctx, paths, load));
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
