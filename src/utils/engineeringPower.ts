import { ActuatorSpec, BatterySpec, COMPONENT_BY_ID, actuatorOf } from '../data/components';
import type { ScenePart } from '../types/robotics';
import { isLegJoint } from './engineeringBody';
import { count } from './engineeringFormat';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { PowerSource, drivesJoint, findPowerSources, sceneRegulators, tetherSource } from './powerSources';

const CONVERTER_EFFICIENCY = 0.9;

export const POWER_CHECK = {
  servoVoltage: 'Servo voltage',
  regulatorInput: 'Regulator input',
  supplyCurrent: 'Supply current',
} as const;

export const servoParts = (parts: ScenePart[]): ScenePart[] => parts.filter(drivesJoint);

const actuatorFor = (p: ScenePart) => actuatorOf(p.componentId!, p.componentVariant);

const actuatorsIn = (ctx: CheckContext) => [...new Set(ctx.servos.map(actuatorFor).filter(Boolean) as ActuatorSpec[])];

const isOver = (b: BatterySpec, a: ActuatorSpec) => b.fullV > a.volts[1] + 1e-6;
const isUnder = (b: BatterySpec, a: ActuatorSpec) => b.fullV < a.volts[0] - 1e-6;
const sagsUnder = (b: BatterySpec, a: ActuatorSpec) => b.nominalV < a.volts[0] - 1e-6;

function servoRail(ctx: CheckContext, acts: ActuatorSpec[], source: PowerSource) {
  const fits = sceneRegulators(ctx.parts).filter(
    ({ regulator: r }) =>
      acts.every((a) => r.vout >= a.volts[0] && r.vout <= a.volts[1]) &&
      source.battery.fullV <= r.vinMax &&
      source.battery.nominalV >= r.vinMin,
  );

  return fits.sort((x, y) => y.regulator.vout - x.regulator.vout || y.regulator.ioutA - x.regulator.ioutA)[0];
}

function railOf(ctx: CheckContext, source: PowerSource) {
  const acts = actuatorsIn(ctx);
  const outOfRange = acts.some((a) => isOver(source.battery, a) || isUnder(source.battery, a));

  return outOfRange ? servoRail(ctx, acts, source) : undefined;
}

function sourceRank(ctx: CheckContext, source: PowerSource): number {
  const acts = actuatorsIn(ctx);

  if (acts.every((a) => !isOver(source.battery, a) && !isUnder(source.battery, a))) return 0;

  return servoRail(ctx, acts, source) ? 1 : 2;
}

export function servoSource(ctx: CheckContext): PowerSource | undefined {
  const ranked = findPowerSources(ctx).map((source) => ({ source, rank: sourceRank(ctx, source) }));
  const best = ranked.sort((x, y) => x.rank - y.rank || x.source.name.localeCompare(y.source.name))[0]?.source;

  return best ?? tetherSource(ctx);
}

export function servoSupplyVolts(ctx: CheckContext): number | undefined {
  const source = servoSource(ctx);

  if (!source) return undefined;

  return railOf(ctx, source)?.regulator.vout ?? source.battery.nominalV;
}

const reaches = (s: PowerSource, only = '') =>
  s.tetherA ? `gives ${s.battery.fullV} V` : `reaches ${only}${s.battery.fullV} V charged`;

const levels = (s: PowerSource) => (s.tetherA ? '' : ` (${s.battery.nominalV} V, ${s.battery.fullV} V charged)`);

function outOfRangeRow(source: PowerSource, over: ScenePart[], under: ScenePart[]): CheckRow {
  const high = `${source.name} ${reaches(source)}, above the ${Math.min(...over.map((p) => actuatorFor(p)!.volts[1]))} V maximum of ${count(over.length, 'servo')}`;
  const low = `${source.name} ${reaches(source, 'only ')}, below the ${Math.max(...under.map((p) => actuatorFor(p)!.volts[0]))} V minimum of ${count(under.length, 'servo')}`;

  return {
    check: POWER_CHECK.servoVoltage,
    status: 'fail',
    detail: over.length ? high : low,
    ids: [...over, ...under].map((p) => p.id),
  };
}

function voltageRow(ctx: CheckContext, source: PowerSource): CheckRow {
  const b = source.battery;
  const inRange = (test: (a: ActuatorSpec) => boolean) =>
    ctx.servos.filter((p) => {
      const act = actuatorFor(p);

      return !!act && test(act);
    });
  const over = inRange((a) => isOver(b, a));
  const under = inRange((a) => isUnder(b, a));
  const sagging = inRange((a) => sagsUnder(b, a));
  const ranges = actuatorsIn(ctx)
    .map((x) => `${x.volts[0]}–${x.volts[1]} V`)
    .join(', ');
  const rail = railOf(ctx, source);

  if (rail)
    return {
      check: POWER_CHECK.servoVoltage,
      status: 'pass',
      detail: `${source.name} ${reaches(source)}; the ${rail.name} (${rail.regulator.vout} V) keeps servos inside their ${ranges} range. Wire the servos to it.`,
      ids: [rail.id],
    };

  if (over.length || under.length) return outOfRangeRow(source, over, under);

  return {
    check: POWER_CHECK.servoVoltage,
    status: sagging.length ? 'warn' : 'pass',
    detail: sagging.length
      ? `${source.name} sits at ${b.nominalV} V for most of its charge, under the ${ranges} range of ${count(sagging.length, 'servo')}`
      : `${source.name}${levels(source)} is inside every servo’s ${ranges} range`,
    ids: sagging.map((p) => p.id),
  };
}

function regulatorRow(ctx: CheckContext, source: PowerSource): CheckRow | undefined {
  const regs = sceneRegulators(ctx.parts);

  if (!regs.length) return undefined;

  const b = source.battery;
  const bad = regs.filter(({ regulator: r }) => b.fullV > r.vinMax || b.nominalV < r.vinMin);

  return {
    check: POWER_CHECK.regulatorInput,
    status: bad.length ? 'fail' : 'pass',
    detail: bad.length
      ? `${source.name}${levels(source)} is outside the input range of ${bad.map((r) => `${r.name} (${r.regulator.vinMin}–${r.regulator.vinMax} V)`).join(', ')}`
      : `${source.name} is inside the input range of every regulator`,
    items: bad.map((r) => ({ text: `${r.name}: ${r.regulator.vinMin}–${r.regulator.vinMax} V in`, ids: [r.id] })),
    ids: bad.map((r) => r.id),
  };
}

function computeWatts(parts: ScenePart[]): [number, number] {
  if (parts.some((p) => p.componentId === 'jetson-orin-nano-devkit')) return [15, 25];

  return parts.some((p) => p.componentId === 'raspberry-pi-5') ? [9, 16] : [2, 4];
}

function servoCurrent(ctx: CheckContext): { peak: number; avg: number } {
  const legIds = new Set(ctx.joints.filter(isLegJoint).flatMap((j) => j.actuators ?? []));
  let peak = 0,
    avg = 0;

  for (const p of ctx.servos) {
    const act = actuatorFor(p);
    const rated = act?.ratedA ?? (act?.stallA ?? 2) / 3;
    const idle = act?.idleA ?? 0.15;
    const leg = legIds.has(p.id);

    peak += leg ? rated : idle * 2;
    avg += leg ? rated * 0.45 : idle;
  }

  return { peak, avg };
}

function currentDraw(ctx: CheckContext, source: PowerSource) {
  const b = source.battery;
  const servo = servoCurrent(ctx);
  const rail = railOf(ctx, source);
  const toPack = rail ? rail.regulator.vout / (b.nominalV * CONVERTER_EFFICIENCY) : 1;
  const computeW = computeWatts(ctx.parts);
  const avg = servo.avg * toPack + computeW[0] / (b.nominalV * CONVERTER_EFFICIENCY);
  const peak = servo.peak * toPack + computeW[1] / (b.nominalV * CONVERTER_EFFICIENCY);

  return { servoPeak: servo.peak, rail, avg, peak };
}

function batteryDetail(source: PowerSource, { avg, peak }: { avg: number; peak: number }): string {
  const runtime = ((0.8 * source.battery.capacityAh) / avg) * 60;

  return `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A standing from the pack (estimate); ${source.name} gives about ${Math.round(runtime)} min. Fuse the pack near ${Math.ceil(peak * 1.4)} A.`;
}

const tetherDetail = (tetherA: number, { avg, peak }: { avg: number; peak: number }) =>
  `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A standing (estimate); the tether gives ${tetherA} A`;

function currentRow(ctx: CheckContext, source: PowerSource): CheckRow {
  const draw = currentDraw(ctx, source);
  const { rail, servoPeak, peak } = draw;
  const b = source.battery;
  const railShort = !!rail && servoPeak > rail.regulator.ioutA;
  const items = railShort
    ? [
        {
          text: `${rail.name} gives ${rail.regulator.ioutA} A; the servos ask for about ${servoPeak.toFixed(1)} A at peak`,
          ids: [rail.id],
          status: 'warn' as const,
        },
      ]
    : [];
  const enough = source.tetherA ? source.tetherA >= peak : b.cRating * b.capacityAh >= 1.5 * peak;
  let status: CheckRow['status'] = 'fail';

  if (enough) status = railShort ? 'warn' : 'pass';

  return {
    check: source.tetherA ? POWER_CHECK.supplyCurrent : 'Current and runtime',
    status,
    detail: source.tetherA ? tetherDetail(source.tetherA, draw) : batteryDetail(source, draw),
    items,
    ids: items.flatMap((i) => i.ids),
  };
}

export function powerRows(ctx: CheckContext): CheckRow[] {
  const { servos } = ctx;

  if (!servos.length) return [];

  const rows: CheckRow[] = [];
  const noVariant = servos.filter((p) => COMPONENT_BY_ID[p.componentId!]?.variants?.length && !p.componentVariant);

  if (noVariant.length)
    rows.push({
      check: 'Servo version',
      status: 'fail',
      detail: `${noVariant.length} servos have no version chosen (voltage and torque differ)`,
      ids: noVariant.map((p) => p.id),
    });

  const source = servoSource(ctx);

  if (!source) return rows;

  const regulator = regulatorRow(ctx, source);

  return [...rows, voltageRow(ctx, source), currentRow(ctx, source), ...(regulator ? [regulator] : [])];
}
