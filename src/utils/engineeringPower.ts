import { ActuatorSpec, COMPONENT_BY_ID, actuatorOf } from '../data/components';
import { MATERIAL_SOFTENS_C } from '../data/supplies';
import type { ScenePart } from '../types/robotics';
import { isPrinted, printMaterialOf } from './bom';
import { convexHull, polygonMargin } from './engineeringMath';
import type { CheckContext, CheckRow } from './engineeringTypes';

const SERVO_CASE_C = 65;

import { PowerSource, findPowerSource, sceneRegulators } from './powerSources';

export function servoParts(parts: ScenePart[]): ScenePart[] {
  return parts.filter(
    (p) => p.kind === 'component' && p.componentId && COMPONENT_BY_ID[p.componentId]?.group === 'Servos',
  );
}

const actuatorFor = (p: ScenePart) => actuatorOf(p.componentId!, p.componentVariant);

function servoRail(ctx: CheckContext, acts: ActuatorSpec[], source: PowerSource) {
  return sceneRegulators(ctx.parts).find(
    ({ regulator: r }) =>
      acts.every((a) => r.vout >= a.volts[0] && r.vout <= a.volts[1]) &&
      source.battery.fullV <= r.vinMax &&
      source.battery.nominalV >= r.vinMin,
  );
}

function voltageRow(ctx: CheckContext, source: PowerSource): CheckRow {
  const b = source.battery;
  const over = ctx.servos.filter((p) => {
    const act = actuatorFor(p);

    return act && b.fullV > act.volts[1] + 1e-6;
  });
  const acts = [...new Set(ctx.servos.map(actuatorFor).filter(Boolean) as ActuatorSpec[])];
  const ranges = acts.map((x) => `${x.volts[0]}–${x.volts[1]} V`).join(', ');
  const rail = over.length ? servoRail(ctx, acts, source) : undefined;

  if (rail)
    return {
      check: 'Servo voltage',
      status: 'pass',
      detail: `${source.name} reaches ${b.fullV} V charged; the ${rail.name} (${rail.regulator.vout} V) keeps servos inside their ${ranges} range. Wire the servos to it.`,
      ids: [rail.id],
    };

  return {
    check: 'Servo voltage',
    status: over.length ? 'fail' : 'pass',
    detail: over.length
      ? `${source.name} reaches ${b.fullV} V charged, above the ${Math.min(...over.map((p) => actuatorFor(p)!.volts[1]))} V maximum of ${over.length} servos`
      : `${source.name} (${b.nominalV} V, ${b.fullV} V charged) is inside every servo's ${ranges} range`,
    ids: over.map((p) => p.id),
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
  const legIds = new Set(ctx.joints.filter((j) => j.limb === 'leg').flatMap((j) => j.actuators ?? []));
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
  const computeW = computeWatts(ctx.parts);
  const avg = servo.avg + computeW[0] / (b.nominalV * 0.9);
  const peak = servo.peak + computeW[1] / (b.nominalV * 0.9);
  const runtime = ((0.8 * b.capacityAh) / avg) * 60;
  const okC = b.cRating * b.capacityAh >= 1.5 * peak;

  return {
    check: 'Current and runtime',
    status: okC ? 'pass' : 'fail',
    detail: `About ${peak.toFixed(1)} A peak and ${avg.toFixed(1)} A standing (estimate); ${source.name} gives about ${Math.round(runtime)} min. Fuse the pack near ${Math.ceil(peak * 1.4)} A.`,
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

  const source = findPowerSource(ctx);

  if (!source)
    return [...rows, { check: 'Battery', status: 'fail', detail: 'No battery. Add one from Parts → Power.' }];

  const regulator = regulatorRow(ctx, source);

  return [...rows, voltageRow(ctx, source), currentRow(ctx, source), ...(regulator ? [regulator] : [])];
}

function stabilityStatus(margin: number, tip: number): CheckRow['status'] {
  if (margin <= 0 || tip < 2) return 'fail';

  return tip < 5 ? 'warn' : 'pass';
}

export function stabilityRows(ctx: CheckContext): CheckRow[] {
  return ctx.onFloor.length && ctx.all.grams > 0 ? [stabilityRow(ctx)] : [];
}

function stabilityRow(ctx: CheckContext): CheckRow {
  const { onFloor, all } = ctx;
  const pts = onFloor.flatMap((p): Array<[number, number]> => {
    const m = ctx.measures[p.id]!;

    return [
      [m.min[0], m.min[2]],
      [m.max[0], m.min[2]],
      [m.max[0], m.max[2]],
      [m.min[0], m.max[2]],
    ];
  });
  const margin = polygonMargin(convexHull(pts), [all.com[0], all.com[2]]);
  const tip = (Math.atan2(margin, Math.max(1, all.com[1])) * 180) / Math.PI;

  return {
    check: 'Standing stability',
    status: stabilityStatus(margin, tip),
    detail:
      margin <= 0
        ? `Centre of mass is ${Math.abs(Math.round(margin))} mm outside the feet: it falls over`
        : `Centre of mass ${Math.round(margin)} mm inside the feet's edge, ${Math.round(all.com[1])} mm up: tips past ${tip.toFixed(1)}°`,
  };
}

function touchesServo(ctx: CheckContext, p: ScenePart): boolean {
  const mat = printMaterialOf(p, ctx.project);
  const m = ctx.measures[p.id];

  if (MATERIAL_SOFTENS_C[mat] >= SERVO_CASE_C || mat === 'TPU' || !m) return false;

  return ctx.servos.some((s) => {
    const n = ctx.measures[s.id];

    return !!n && [0, 1, 2].every((k) => m.min[k] <= n.max[k] + 1 && n.min[k] <= m.max[k] + 1);
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
        ? `${soft.length} parts touching a servo are PLA, which softens at ${MATERIAL_SOFTENS_C.PLA} °C; servos run at 60–70 °C. Print them in PETG or ASA.`
        : 'Parts touching servos are in heat-tolerant filament',
      ids: soft,
    },
  ];
}
