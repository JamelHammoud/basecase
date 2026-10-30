import { MATERIAL_DENSITY } from '../data/supplies';
import type { PrinterSetup } from '../data/printers';
import { bedOf, bedSizeText } from '../print/bed';
import { buildPrintPlan, choosePose, type PrintCheck, type PrintPlan } from '../print/plan';
import type { MeshMeasure } from '../three/meshMeasure';
import { PRINT_RULES, printHours, type PrintShape, type Vec3 } from '../three/printability';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { filamentGrams, isPrinted, printMaterialOf } from './bom';

const SUPPORT_FILL = 0.2;
const SHELL_MM = 0.9;

export type { PrintCheck } from '../print/plan';

export interface PrintedPartReport {
  id: string;
  name: string;
  material: PrintMaterial;
  check: PrintCheck;
  grams: number;
  supportG: number;
  hours: number;
  plate: number;
  copies: number;
  issues: string[];
}

export interface PrintReport {
  printer: PrinterSetup;
  parts: PrintedPartReport[];
  plates: Partial<Record<PrintMaterial, number>>;
  plan: PrintPlan;
  totals: { grams: number; supportG: number; hours: number; failing: number };
}

export const fmtSize = (size: number[]) =>
  size.map((v) => (v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)))).join(' × ');

interface PartShape {
  check: PrintShape;
  measure: MeshMeasure;
}

const shapes = new Map<string, PartShape>();
const MAX_CACHED = 4000;

export function shapeKey(p: ScenePart): string {
  const c = p.cad;

  return [
    p.id,
    p.kind,
    JSON.stringify(p.dimensions),
    JSON.stringify(p.deformers ?? null),
    c ? `${c.language}:${c.code.length}:${c.positions.length}:${c.code.slice(-64)}` : '',
    p.sculptMesh?.positions.length ?? 0,
    p.customNodes?.length ?? 0,
    p.hardware ? JSON.stringify(p.hardware) : '',
  ].join('|');
}

const cacheKey = (p: ScenePart) => `${shapeKey(p)}|${p.print?.down?.join(',') ?? ''}`;

export type PrintShapes = (
  ids: string[],
  faces?: Record<string, Vec3[]>,
) => Promise<Record<string, { check: PrintShape | null; measure: MeshMeasure } | undefined>>;

export async function loadPrintShapes(parts: ScenePart[], fetchShapes: PrintShapes): Promise<void> {
  const missing = parts.filter(isPrinted).filter((p) => !shapes.has(cacheKey(p)));

  if (!missing.length) return;

  if (shapes.size > MAX_CACHED) shapes.clear();

  const faces = Object.fromEntries(missing.filter((p) => p.print?.down).map((p) => [p.id, [p.print!.down!]]));
  const found = await fetchShapes(
    missing.map((p) => p.id),
    faces,
  );

  for (const part of missing) {
    const shape = found[part.id];

    if (shape?.check) shapes.set(cacheKey(part), { check: shape.check, measure: shape.measure });
  }
}

function issuesFor(check: PrintCheck, grams: number, supportG: number): string[] {
  const issues: string[] = [];

  if (!check.fits) issues.push(check.fitNote ?? 'Too big for the plate. Split it or scale it down.');

  if (check.thinShare > 0.02 || check.minWallMm < PRINT_RULES.minWallMm * 0.6)
    issues.push(`Thicken walls to 0.84 mm, the thinnest that prints (now ${check.minWallMm.toFixed(2)} mm)`);

  if (supportG > Math.max(2, grams * 0.25))
    issues.push(`Add 45° chamfers or split it flat (needs about ${Math.round(supportG)} g of support)`);

  return issues;
}

function reportPart(part: ScenePart, shape: PartShape, ctx: { project: ProjectSettings; printer: PrinterSetup }) {
  const { measure } = shape;
  const check = choosePose(shape.check, bedOf(ctx.printer.model), part.print);
  const material = printMaterialOf(part, ctx.project);
  const grams = filamentGrams(measure, material, ctx.project.infillPct);
  const supportG = (check.supportMm3 * SUPPORT_FILL * MATERIAL_DENSITY[material]) / 1000;
  const shell = Math.min(measure.volumeMm3, measure.areaMm2 * SHELL_MM);
  const infill = Math.max(0, measure.volumeMm3 - shell) * (ctx.project.infillPct / 100);
  const hours = printHours({
    shellMm3: shell,
    infillMm3: infill,
    supportMm3: check.supportMm3,
    heightMm: check.size[2],
    material,
  });

  return {
    id: part.id,
    name: part.name,
    material,
    check,
    grams,
    supportG,
    hours,
    plate: 0,
    copies: 1,
    issues: issuesFor(check, grams, supportG),
  };
}

const sum = (parts: PrintedPartReport[], value: (r: PrintedPartReport) => number) =>
  parts.reduce((total, r) => total + value(r), 0);

export interface PrintContext {
  project: ProjectSettings;
  printer: PrinterSetup;
}

export async function printReportOf(parts: ScenePart[], ctx: PrintContext, fetchShapes: PrintShapes) {
  await loadPrintShapes(parts, fetchShapes);

  return buildPrintReport(parts, ctx);
}

export const printSettingsKey = (project: ProjectSettings) => `${project.printProcess ?? ''}|${project.infillPct}`;

export function buildPrintReport(parts: ScenePart[], ctx: PrintContext): PrintReport {
  const printed = parts.filter((p) => isPrinted(p) && !p.print?.skip);
  const byId = new Map(printed.map((p) => [p.id, p]));
  const out: PrintedPartReport[] = printed.flatMap((part) => {
    const shape = shapes.get(cacheKey(part));

    return shape ? [{ ...reportPart(part, shape, ctx), copies: Math.max(1, part.print?.copies ?? 1) }] : [];
  });
  const plan = buildPrintPlan(
    out.map((r) => ({ ...r, shapeKey: shapeKey(byId.get(r.id)!), print: byId.get(r.id)!.print })),
    ctx.printer,
    bedOf(ctx.printer.model),
    printSettingsKey(ctx.project),
  );
  const plates: PrintReport['plates'] = {};

  for (const plate of plan.plates) plates[plate.material] = (plates[plate.material] ?? 0) + 1;

  for (const r of out) r.plate = plan.plateOf[r.id] ?? 0;

  out.sort((a, b) => b.issues.length - a.issues.length || b.grams - a.grams);

  return {
    printer: ctx.printer,
    parts: out,
    plates,
    plan,
    totals: {
      grams: sum(out, (r) => r.grams * r.copies),
      supportG: sum(out, (r) => r.supportG * r.copies),
      hours: sum(out, (r) => r.hours * r.copies),
      failing: out.filter((r) => r.issues.length).length,
    },
  };
}

const AXIS_TO_AGENT: Record<string, string> = {
  '+x': '+x',
  '-x': '-x',
  '+y': '+z',
  '-y': '-z',
  '+z': '-y',
  '-z': '+y',
};

function faceText(check: PrintCheck): string {
  const { axis, down } = check.pose;

  if (axis) return `print with local ${AXIS_TO_AGENT[axis]} up`;

  const up = [-down[0], down[2], -down[1]].map((v) => v.toFixed(2)).join(', ');

  return `print on its flat face, local (${up}) up`;
}

export function printReportText(r: PrintReport): string {
  if (!r.parts.length) return 'No printed parts.';

  const bed = r.plan.bed;
  const lines: string[] = [];
  const plates = Object.entries(r.plates)
    .map(([m, n]) => `${n} ${m} plate${n === 1 ? '' : 's'}`)
    .join(', ');
  const keepOut = bed.keepOut.length
    ? `, ${bed.keepOut.map((k) => `${Math.round(k.w)} × ${Math.round(k.d)} mm`).join(' and ')} keep-out`
    : '';

  lines.push(
    `${r.parts.length} printed parts on a ${r.printer.model.name} (${bedSizeText(bed)}${keepOut}): about ${Math.round(r.totals.grams)} g + ${Math.round(r.totals.supportG)} g support, ${r.totals.hours.toFixed(1)} h, ${plates}. Estimates without a slicer.`,
  );
  lines.push(r.totals.failing ? `${r.totals.failing} parts have issues:` : 'Every part fits and prints.');

  for (const p of r.parts) {
    const s = fmtSize(p.check.size);
    const turned = p.check.yaw && p.check.yaw % 90 ? `, turned ${p.check.yaw}° across the plate` : '';
    const head = `- ${p.id} (${p.material}, ${Math.round(p.grams)} g${p.supportG >= 1 ? ` + ${Math.round(p.supportG)} g support` : ''}, ${s} mm, ${faceText(p.check)}${turned})`;

    lines.push(p.issues.length ? `${head}: ${p.issues.join('; ')}` : head);
  }

  return lines.join('\n');
}
