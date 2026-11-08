import { ActuatorSpec, BatterySpec, COMPONENT_BY_ID, actuatorOf } from '../data/components';
import { MATERIAL_SOFTENS_C } from '../data/supplies';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { isPrinted, printMaterialOf } from './bom';
import { isLegJoint, type RobotBody } from './engineeringBody';
import { count } from './engineeringFormat';
import { convexHull, lineDistance, norm, polygonMargin, type V3 } from './engineeringMath';
import type { CheckContext, CheckRow, Stability } from './engineeringTypes';
import { PowerSource, findPowerSources, sceneRegulators } from './powerSources';

const SERVO_CASE_C = 65;
const CONVERTER_EFFICIENCY = 0.9;

export function servoParts(parts: ScenePart[]): ScenePart[] {
  return parts.filter((p) => {
    const c = p.kind === 'component' && p.componentId ? COMPONENT_BY_ID[p.componentId] : undefined;

    return c?.group === 'Servos' || !!c?.actuator;
  });
}

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

  return ranked.sort((x, y) => x.rank - y.rank || x.source.name.localeCompare(y.source.name))[0]?.source;
}

export function servoSupplyVolts(ctx: CheckContext): number | undefined {
  const source = servoSource(ctx);

  if (!source) return undefined;

  return railOf(ctx, source)?.regulator.vout ?? source.battery.nominalV;
}

function outOfRangeRow(source: PowerSource, over: ScenePart[], under: ScenePart[]): CheckRow {
  const b = source.battery;
  const high = `${source.name} reaches ${b.fullV} V charged, above the ${Math.min(...over.map((p) => actuatorFor(p)!.volts[1]))} V maximum of ${count(over.length, 'servo')}`;
  const low = `${source.name} reaches only ${b.fullV} V charged, below the ${Math.max(...under.map((p) => actuatorFor(p)!.volts[0]))} V minimum of ${count(under.length, 'servo')}`;

  return {
    check: 'Servo voltage',
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
      check: 'Servo voltage',
      status: 'pass',
      detail: `${source.name} reaches ${b.fullV} V charged; the ${rail.name} (${rail.regulator.vout} V) keeps servos inside their ${ranges} range. Wire the servos to it.`,
      ids: [rail.id],
    };

  if (over.length || under.length) return outOfRangeRow(source, over, under);

  return {
    check: 'Servo voltage',
    status: sagging.length ? 'warn' : 'pass',
    detail: sagging.length
      ? `${source.name} sits at ${b.nominalV} V for most of its charge, under the ${ranges} range of ${count(sagging.length, 'servo')}`
      : `${source.name} (${b.nominalV} V, ${b.fullV} V charged) is inside every servo's ${ranges} range`,
    ids: sagging.map((p) => p.id),
  };
}

function regulatorRow(ctx: CheckContext, source: PowerSource): CheckRow | undefined {
  const regs = sceneRegulators(ctx.parts);

  if (!regs.length) return undefined;

  const b = source.battery;
  const bad = regs.filter(({ regulator: r }) => b.fullV > r.vinMax || b.nominalV < r.vinMin);

  return {
    check: 'Regulator input',
    status: bad.length ? 'fail' : 'pass',
    detail: bad.length
      ? `${source.name} (${b.nominalV} V, ${b.fullV} V charged) is outside the input range of ${bad.map((r) => `${r.name} (${r.regulator.vinMin}–${r.regulator.vinMax} V)`).join(', ')}`
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

function currentRow(ctx: CheckContext, source: PowerSource): CheckRow {
  const b = source.battery;
  const servo = servoCurrent(ctx);
  const rail = railOf(ctx, source);
  const toPack = rail ? rail.regulator.vout / (b.nominalV * CONVERTER_EFFICIENCY) : 1;
  const computeW = computeWatts(ctx.parts);
  const avg = servo.avg * toPack + computeW[0] / (b.nominalV * CONVERTER_EFFICIENCY);
  const peak = servo.peak * toPack + computeW[1] / (b.nominalV * CONVERTER_EFFICIENCY);
  const runtime = ((0.8 * b.capacityAh) / avg) * 60;
  const okC = b.cRating * b.capacityAh >= 1.5 * peak;
  const railShort = !!rail && servo.peak > rail.regulator.ioutA;
  const items = railShort
    ? [
        {
          text: `${rail.name} gives ${rail.regulator.ioutA} A; the servos ask for about ${servo.peak.toFixed(1)} A at peak`,
          ids: [rail.id],
          status: 'warn' as const,
        },
      ]
    : [];
  let status: CheckRow['status'] = 'fail';

  if (okC) status = railShort ? 'warn' : 'pass';

  return {
    check: 'Current and runtime',
    status,
    detail: `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A standing from the pack (estimate); ${source.name} gives about ${Math.round(runtime)} min. Fuse the pack near ${Math.ceil(peak * 1.4)} A.`,
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

  if (!source)
    return [...rows, { check: 'Battery', status: 'fail', detail: 'No battery. Add one from Parts → Power.' }];

  const regulator = regulatorRow(ctx, source);

  return [...rows, voltageRow(ctx, source), currentRow(ctx, source), ...(regulator ? [regulator] : [])];
}

function stabilityStatus({ marginMm, tipDeg, onALine }: Stability): CheckRow['status'] {
  if (onALine) return 'warn';

  if (marginMm <= 0 || tipDeg < 2) return 'fail';

  return tipDeg < 5 ? 'warn' : 'pass';
}

const ROUND_TOLERANCE = 0.1;
const LEVEL_AXIS = 0.98;

function wheelAxle(ctx: CheckContext, p: ScenePart): V3 | undefined {
  const m = ctx.measures[p.id]!;
  const centre = [0, 1, 2].map((k) => (m.min[k] + m.max[k]) / 2) as V3;
  const size = [0, 1, 2].map((k) => m.max[k] - m.min[k]) as V3;

  return ctx.joints
    .filter((j) => j.type === 'revolute' && j.child.includes(p.id))
    .map((j) => ({ j, a: norm(j.axis) }))
    .filter(({ j, a }) => {
      const along = Math.abs(a[0]) >= LEVEL_AXIS ? 0 : 2;
      const across = 2 - along;
      const level = Math.abs(a[along]) >= LEVEL_AXIS;
      const round = Math.abs(size[1] - size[across]) <= ROUND_TOLERANCE * size[1];

      return level && round && lineDistance(centre, j.origin, a) <= ROUND_TOLERANCE * size[1];
    })[0]?.a;
}

function contactPoints(ctx: CheckContext, p: ScenePart): Array<[number, number]> {
  const m = ctx.measures[p.id]!;
  const axle = wheelAxle(ctx, p);

  if (!axle)
    return [
      [m.min[0], m.min[2]],
      [m.max[0], m.min[2]],
      [m.max[0], m.max[2]],
      [m.min[0], m.max[2]],
    ];

  const across = Math.abs(axle[0]) > Math.abs(axle[2]) ? 2 : 0;
  const mid = (m.min[across] + m.max[across]) / 2;

  return across === 2
    ? [
        [m.min[0], mid],
        [m.max[0], mid],
      ]
    : [
        [mid, m.min[2]],
        [mid, m.max[2]],
      ];
}

function bodyStability(ctx: CheckContext, b: RobotBody): Stability | undefined {
  if (!b.feet.length || b.mass.grams <= 0) return undefined;

  const hull = convexHull(b.feet.flatMap((p) => contactPoints(ctx, p)));
  const heightMm = b.mass.com[1];
  const onALine = hull.length < 3;
  const marginMm = onALine ? 0 : polygonMargin(hull, [b.mass.com[0], b.mass.com[2]]);

  return { marginMm, heightMm, onALine, tipDeg: (Math.atan2(marginMm, Math.max(1, heightMm)) * 180) / Math.PI };
}

export function stabilityOf(ctx: CheckContext): Stability | undefined {
  const all = ctx.bodies.flatMap((b) => bodyStability(ctx, b) ?? []);

  return all.sort((x, y) => x.marginMm - y.marginMm)[0];
}

export function stabilityRows(ctx: CheckContext): CheckRow[] {
  const s = stabilityOf(ctx);

  return s ? [stabilityRow(s)] : [];
}

function stabilityDetail({ marginMm, heightMm, tipDeg, onALine }: Stability): string {
  if (onALine) return 'Rests on a line with no third contact, so it has to balance itself';

  return marginMm <= 0
    ? `Centre of mass is ${Math.abs(Math.round(marginMm))} mm outside the feet: it falls over`
    : `Centre of mass ${Math.round(marginMm)} mm inside the outline of the feet, ${Math.round(heightMm)} mm up: tips past ${tipDeg.toFixed(1)}°`;
}

function stabilityRow(s: Stability): CheckRow {
  return { check: 'Standing stability', status: stabilityStatus(s), detail: stabilityDetail(s) };
}

const AGAINST_MM = 1;
const WRAPS_MM = 10;

function sitsAgainst(m: MeshMeasure, n: MeshMeasure): boolean {
  const overlaps = [0, 1, 2].every((k) => m.min[k] <= n.max[k] + AGAINST_MM && n.min[k] <= m.max[k] + AGAINST_MM);
  const standsClear = [0, 1, 2].every((k) => n.min[k] - m.min[k] > WRAPS_MM && m.max[k] - n.max[k] > WRAPS_MM);

  return overlaps && !standsClear;
}

function touchesServo(ctx: CheckContext, p: ScenePart): boolean {
  const mat = printMaterialOf(p, ctx.project);
  const m = ctx.measures[p.id];

  if (MATERIAL_SOFTENS_C[mat] >= SERVO_CASE_C || mat === 'TPU' || !m) return false;

  return ctx.servos.some((s) => {
    const n = ctx.measures[s.id];

    return !!n && sitsAgainst(m, n);
  });
}

export function heatRows(ctx: CheckContext): CheckRow[] {
  if (!ctx.servos.length) return [];

  const soft = ctx.parts
    .filter(isPrinted)
    .filter((p) => touchesServo(ctx, p))
    .map((p) => p.id);

  return [
    {
      check: 'Heat near servos',
      status: soft.length ? 'warn' : 'pass',
      detail: soft.length
        ? `${soft.length} parts around a servo are PLA, which softens at ${MATERIAL_SOFTENS_C.PLA} °C; servos run at 60–70 °C. Print them in PETG or ASA.`
        : 'Parts within 1 mm of a servo’s outline are in heat-tolerant filament',
      ids: soft,
    },
  ];
}
