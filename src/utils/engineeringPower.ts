import { ActuatorSpec, BatterySpec, COMPONENT_BY_ID, actuatorOf } from '../data/components';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { isLegJoint } from './engineeringBody';
import { duration } from './duration';
import { jointLabel } from './engineeringFormat';
import { plural } from '../../electron/plural.mjs';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { PowerSource, drivesJoint, findPowerSources, sceneRegulators, tetherSource } from './powerSources';
import { IDLE_A, STALL_A } from './servoAmps';

const CONVERTER_EFFICIENCY = 0.9;

export const POWER_CHECK = {
  servoVoltage: 'Servo voltage',
  regulatorInput: 'Regulator input',
  supplyCurrent: 'Supply current',
} as const;

export const servoParts = (parts: ScenePart[]): ScenePart[] => parts.filter(drivesJoint);

const actuatorFor = (p: ScenePart) => actuatorOf(p.componentId!, p.componentVariant);

type PowerScene = Pick<CheckContext, 'parts' | 'project' | 'servos'>;

const actuatorsIn = (ctx: PowerScene) => [...new Set(ctx.servos.map(actuatorFor).filter(Boolean) as ActuatorSpec[])];

const isOver = (b: BatterySpec, a: ActuatorSpec) => b.fullV > a.volts[1] + 1e-6;
const isUnder = (b: BatterySpec, a: ActuatorSpec) => b.fullV < a.volts[0] - 1e-6;
const sagsUnder = (b: BatterySpec, a: ActuatorSpec) => b.nominalV < a.volts[0] - 1e-6;

function servoRail(ctx: PowerScene, acts: ActuatorSpec[], source: PowerSource) {
  const fits = sceneRegulators(ctx.parts).filter(
    ({ regulator: r }) =>
      acts.every((a) => r.vout >= a.volts[0] && r.vout <= a.volts[1]) &&
      source.battery.fullV <= r.vinMax &&
      source.battery.nominalV >= r.vinMin,
  );

  return fits.sort((x, y) => y.regulator.vout - x.regulator.vout || y.regulator.ioutA - x.regulator.ioutA)[0];
}

function railOf(ctx: PowerScene, source: PowerSource) {
  const acts = actuatorsIn(ctx);
  const outOfRange = acts.some((a) => isOver(source.battery, a) || isUnder(source.battery, a));

  return outOfRange ? servoRail(ctx, acts, source) : undefined;
}

function sourceRank(ctx: PowerScene, source: PowerSource): number {
  const acts = actuatorsIn(ctx);

  if (acts.every((a) => !isOver(source.battery, a) && !isUnder(source.battery, a))) return 0;

  return servoRail(ctx, acts, source) ? 1 : 2;
}

export function servoSource(ctx: PowerScene): PowerSource | undefined {
  const ranked = findPowerSources(ctx).map((source) => ({ source, rank: sourceRank(ctx, source) }));
  const best = ranked.sort((x, y) => x.rank - y.rank || x.source.name.localeCompare(y.source.name))[0]?.source;

  return best ?? tetherSource(ctx);
}

export function servoRegulator(ctx: PowerScene) {
  const source = servoSource(ctx);

  return source ? railOf(ctx, source) : undefined;
}

export function servoSupplyVolts(ctx: PowerScene): number | undefined {
  const source = servoSource(ctx);

  if (!source) return undefined;

  return railOf(ctx, source)?.regulator.vout ?? source.battery.nominalV;
}

const reaches = (s: PowerSource, only = '') =>
  s.tetherA ? `gives ${s.battery.fullV} V` : `reaches ${only}${s.battery.fullV} V charged`;

const levels = (s: PowerSource) => (s.tetherA ? '' : ` (${s.battery.nominalV} V, ${s.battery.fullV} V charged)`);

function outOfRangeRow(source: PowerSource, over: ScenePart[], under: ScenePart[]): CheckRow {
  const high = `${source.name} ${reaches(source)}, above the ${Math.min(...over.map((p) => actuatorFor(p)!.volts[1]))} V maximum of ${plural(over.length, 'servo')}`;
  const low = `${source.name} ${reaches(source, 'only ')}, below the ${Math.max(...under.map((p) => actuatorFor(p)!.volts[0]))} V minimum of ${plural(under.length, 'servo')}`;

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
      ? `${source.name} sits at ${b.nominalV} V for most of its charge, under the ${ranges} range of ${plural(sagging.length, 'servo')}`
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

interface ServoDraw {
  peak: number;
  avg: number;
  hungriest?: { joint: RobotJoint; avgA: number; peakA: number };
}

function servoCurrent(ctx: CheckContext): ServoDraw {
  const legIds = new Set(ctx.joints.filter(isLegJoint).flatMap((j) => j.actuators ?? []));
  let peak = 0,
    avg = 0;

  for (const p of ctx.servos) {
    const act = actuatorFor(p);
    const rated = act?.ratedA ?? (act?.stallA ?? STALL_A) / 3;
    const idle = act?.idleA ?? IDLE_A;
    const leg = legIds.has(p.id);

    peak += leg ? rated : idle * 2;
    avg += leg ? rated * 0.45 : idle;
  }

  return { peak, avg };
}

function walkedCurrent(ctx: CheckContext): ServoDraw | undefined {
  const walk = ctx.input.walk;

  if (typeof walk !== 'object' || walk.fellAt !== null || !walk.power) return undefined;

  const walked = ctx.joints.filter((j) => walk.power!.joints[j.id]);

  if (!walked.length) return undefined;

  const driven = new Set(walked.flatMap((j) => j.actuators ?? []));
  const idle = ctx.servos.filter((p) => !driven.has(p.id)).map((p) => actuatorFor(p)?.idleA ?? IDLE_A);
  const idleA = idle.reduce((s, a) => s + a, 0);
  const joint = [...walked].sort((a, b) => walk.power!.joints[b.id].avgA - walk.power!.joints[a.id].avgA)[0];

  return {
    peak: walk.power.peakA + idleA * 2,
    avg: walk.power.avgA + idleA,
    hungriest: { joint, ...walk.power.joints[joint.id] },
  };
}

function currentDraw(ctx: CheckContext, source: PowerSource) {
  const b = source.battery;
  const servo = walkedCurrent(ctx) ?? servoCurrent(ctx);
  const rail = railOf(ctx, source);
  const toPack = rail ? rail.regulator.vout / (b.nominalV * CONVERTER_EFFICIENCY) : 1;
  const computeW = computeWatts(ctx.parts);
  const avg = servo.avg * toPack + computeW[0] / (b.nominalV * CONVERTER_EFFICIENCY);
  const peak = servo.peak * toPack + computeW[1] / (b.nominalV * CONVERTER_EFFICIENCY);

  return { servoPeak: servo.peak, rail, avg, peak, hungriest: servo.hungriest };
}

type Draw = ReturnType<typeof currentDraw>;

const amps = ({ avg, peak, hungriest }: Draw) =>
  hungriest
    ? `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A average walking`
    : `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A standing`;

const jointAmps = (h: NonNullable<Draw['hungriest']>) =>
  `${jointLabel(h.joint)}: ${h.avgA.toFixed(1)} A average, ${h.peakA.toFixed(1)} A peak`;

const hungriestNote = (draw: Draw) => (draw.hungriest ? ` ${jointAmps(draw.hungriest)}.` : '');

const estimated = (draw: Draw) => (draw.hungriest ? '' : ' (estimate)');

function batteryDetail(source: PowerSource, draw: Draw): string {
  const runtime = ((0.8 * source.battery.capacityAh) / draw.avg) * 60;

  return `${amps(draw)} from the pack${estimated(draw)}; ${source.name} gives about ${duration(runtime * 60, 'min')}. Fuse the pack near ${Math.ceil(draw.peak * 1.4)} A.${hungriestNote(draw)}`;
}

const tetherDetail = (tetherA: number, draw: Draw) =>
  `${amps(draw)}${estimated(draw)}; the tether gives ${tetherA} A${hungriestNote(draw)}`;

function railWarning({ rail, servoPeak }: Draw): NonNullable<CheckRow['items']> {
  if (!rail || servoPeak <= rail.regulator.ioutA) return [];

  return [
    {
      text: `${rail.name} gives ${rail.regulator.ioutA} A; the servos ask for about ${servoPeak.toFixed(1)} A at peak`,
      ids: [rail.id],
      status: 'warn',
    },
  ];
}

function currentRow(ctx: CheckContext, source: PowerSource): CheckRow {
  const draw = currentDraw(ctx, source);
  const b = source.battery;
  const warning = railWarning(draw);
  const hungriest = draw.hungriest && !warning.length ? draw.hungriest : undefined;
  const enough = source.tetherA ? source.tetherA >= draw.peak : b.cRating * b.capacityAh >= 1.5 * draw.peak;
  let status: CheckRow['status'] = 'fail';

  if (enough) status = warning.length ? 'warn' : 'pass';

  return {
    check: source.tetherA ? POWER_CHECK.supplyCurrent : 'Current and runtime',
    status,
    detail: source.tetherA ? tetherDetail(source.tetherA, draw) : batteryDetail(source, draw),
    items: hungriest ? [{ text: jointAmps(hungriest), ids: hungriest.joint.actuators ?? [] }] : warning,
    ...(hungriest ? { itemsAreContext: true } : {}),
    ids: warning.flatMap((i) => i.ids ?? []),
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
      detail: `No version chosen for ${plural(noVariant.length, 'servo')} (voltage and torque differ)`,
      ids: noVariant.map((p) => p.id),
    });

  const source = servoSource(ctx);

  if (!source) return rows;

  const regulator = regulatorRow(ctx, source);

  return [...rows, voltageRow(ctx, source), currentRow(ctx, source), ...(regulator ? [regulator] : [])];
}
