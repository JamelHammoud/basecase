import { MATERIAL_SOFTENS_C } from '../data/supplies';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ScenePart } from '../types/robotics';
import { isPrinted, printMaterialOf } from './bom';
import { servoParts } from './engineeringPower';
import type { CheckContext, CheckRow } from './engineeringTypes';
import { plural } from '../../electron/plural.mjs';

const SERVO_CASE_C = 65;

export const SERVO_TOUCH_MM = 1;

const AGAINST_MM = SERVO_TOUCH_MM;
const WRAPS_MM = 10;

const boxesNear = (m: MeshMeasure, n: MeshMeasure) =>
  m.min[0] <= n.max[0] + AGAINST_MM &&
  n.min[0] <= m.max[0] + AGAINST_MM &&
  m.min[1] <= n.max[1] + AGAINST_MM &&
  n.min[1] <= m.max[1] + AGAINST_MM &&
  m.min[2] <= n.max[2] + AGAINST_MM &&
  n.min[2] <= m.max[2] + AGAINST_MM;

export function servoTouchPairs(
  parts: ScenePart[],
  measures: Record<string, MeshMeasure | undefined>,
): Array<[string, string]> {
  const servos = servoParts(parts).flatMap((s) => {
    const measure = measures[s.id];

    return measure ? [{ id: s.id, measure }] : [];
  });
  const pairs: Array<[string, string]> = [];

  for (const p of parts) {
    if (!isPrinted(p)) continue;

    const m = measures[p.id];

    if (!m) continue;

    for (const s of servos) {
      if (boxesNear(m, s.measure)) pairs.push([p.id, s.id]);
    }
  }

  return pairs;
}

function sitsAgainst(m: MeshMeasure, n: MeshMeasure): boolean {
  const overlaps = boxesNear(m, n);
  const standsClear =
    n.min[0] - m.min[0] > WRAPS_MM &&
    m.max[0] - n.max[0] > WRAPS_MM &&
    n.min[1] - m.min[1] > WRAPS_MM &&
    m.max[1] - n.max[1] > WRAPS_MM &&
    n.min[2] - m.min[2] > WRAPS_MM &&
    m.max[2] - n.max[2] > WRAPS_MM;

  return overlaps && !standsClear;
}

function touchesServo(ctx: CheckContext, p: ScenePart): boolean {
  const mat = printMaterialOf(p, ctx.project);
  const m = ctx.measures[p.id];
  const touching = ctx.input.servoTouches;

  if (MATERIAL_SOFTENS_C[mat] >= SERVO_CASE_C || mat === 'TPU') return false;

  if (touching) return touching.includes(p.id);

  return (
    !!m &&
    ctx.servos.some((s) => {
      const n = ctx.measures[s.id];

      return !!n && sitsAgainst(m, n);
    })
  );
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
        ? `Print ${plural(soft.length, 'part')} around a servo in PETG or ASA: PLA softens at ${MATERIAL_SOFTENS_C.PLA} °C, and servos run at 60–70 °C.`
        : `Parts within 1 mm of a servo${ctx.input.servoTouches ? '' : '’s outline'} are in heat-tolerant filament`,
      ids: soft,
    },
  ];
}
