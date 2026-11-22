import { MATERIAL_DENSITY } from '../data/supplies';
import type { PrinterSetup } from '../data/printers';
import { bedOf, bedSizeText } from '../print/bed';
import { sizeLabel } from './size';
import { angle } from './angle';
import { buildPrintPlan, choosePose, type PrintCheck, type PrintPlan } from '../print/plan';
import type { MeshMeasure } from '../three/meshMeasure';
import { PRINT_RULES, printHours, type PrintShape, type Vec3 } from '../three/printability';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { firstSteps, guideStepParts } from '../guide/guideSteps';
import { filamentGrams, isPrinted, printMaterialOf } from './bom';
import { duration } from './duration';
import { weight } from './weight';
import { shapeKey } from '../print/shapeKey';
import { plural } from '../../electron/plural.mjs';

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
  notes: string[];
}

export interface PrintReport {
  printer: PrinterSetup;
  parts: PrintedPartReport[];
  plates: Partial<Record<PrintMaterial, number>>;
  plan: PrintPlan;
  totals: { grams: number; supportG: number; hours: number; failing: number };
}

export interface PartShape {
  check: PrintShape;
  measure: MeshMeasure;
}

const shapes = new Map<string, PartShape>();
const pendingShapes = new WeakMap<PrintShapes, Map<string, Promise<void>>>();
const MAX_CACHED = 4000;

const cacheKey = (p: ScenePart) => `${shapeKey(p)}|${p.print?.down?.join(',') ?? ''}`;

export type PrintShapes = (
  ids: string[],
  faces?: Record<string, Vec3[]>,
) => Promise<Record<string, { check: PrintShape | null; measure: MeshMeasure } | undefined>>;

async function fetchPrintShapes(parts: ScenePart[], fetchShapes: PrintShapes): Promise<void> {
  const faces = Object.fromEntries(parts.filter((p) => p.print?.down).map((p) => [p.id, [p.print!.down!]]));
  const found = await fetchShapes(
    parts.map((p) => p.id),
    faces,
  );

  for (const part of parts) {
    const shape = found[part.id];
    const key = cacheKey(part);

    if (shape?.check && !shapes.has(key)) shapes.set(key, { check: shape.check, measure: shape.measure });
  }
}

export async function loadPrintShapes(parts: ScenePart[], fetchShapes: PrintShapes): Promise<void> {
  const missing = parts.filter(isPrinted).filter((p) => !shapes.has(cacheKey(p)));

  if (!missing.length) return;

  if (shapes.size > MAX_CACHED) shapes.clear();

  const pending = pendingShapes.get(fetchShapes) ?? new Map<string, Promise<void>>();

  pendingShapes.set(fetchShapes, pending);

  const fresh = missing.filter((part) => !pending.has(cacheKey(part)));

  if (fresh.length) {
    const keys = fresh.map(cacheKey);
    const job: Promise<void> = fetchPrintShapes(fresh, fetchShapes).finally(() => {
      for (const key of keys) if (pending.get(key) === job) pending.delete(key);
    });

    for (const key of keys) pending.set(key, job);
  }

  await Promise.all(new Set(missing.map((part) => pending.get(cacheKey(part)))));
}

const THIN_PANEL_MM2 = 100;
const THIN_PART_SHARE = 0.1;

export type ThinWall = 'none' | 'edge' | 'panel';

export function thinWallOf(check: Pick<PrintCheck, 'minWallMm' | 'thinShare' | 'thinAreaMm2'>): ThinWall {
  if (check.minWallMm >= PRINT_RULES.minWallMm) return 'none';

  return check.thinAreaMm2 >= THIN_PANEL_MM2 || check.thinShare >= THIN_PART_SHARE ? 'panel' : 'edge';
}

const edgeNote = (check: PrintCheck) =>
  `Knife edges down to ${check.minWallMm.toFixed(2)} mm over about ${Math.round(check.thinAreaMm2)} mm²; the slicer drops them`;

function issuesFor(check: PrintCheck, grams: number, supportG: number): string[] {
  const issues: string[] = [];

  if (!check.fits) issues.push(check.fitNote ?? 'Too big for the plate. Split it or scale it down.');

  if (thinWallOf(check) === 'panel')
    issues.push(
      `Thicken walls to 0.84 mm, the thinnest that prints (now ${check.minWallMm.toFixed(2)} mm over about ${Math.round(check.thinAreaMm2)} mm²)`,
    );

  if (supportG > Math.max(2, grams * 0.25))
    issues.push(`Add 45° chamfers or split it flat (needs about ${weight(supportG)} of support)`);

  return issues;
}

function reportPart(part: PrintReportPart, shape: PartShape, ctx: PreparedPrintReport['ctx']) {
  const { measure } = shape;
  const check = choosePose(shape.check, bedOf(ctx.printer.model, ctx.project.printProcess), part.print);
  const { material } = part;
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
    notes: thinWallOf(check) === 'edge' ? [edgeNote(check)] : [],
  };
}

const sum = (parts: PrintedPartReport[], value: (r: PrintedPartReport) => number) =>
  parts.reduce((total, r) => total + value(r), 0);

export interface PrintContext {
  project: ProjectSettings;
  printer: PrinterSetup;
  scene?: ScenePart[];
}

export const printSettingsKey = (project: Pick<ProjectSettings, 'printProcess' | 'infillPct'>) =>
  `${project.printProcess ?? ''}|${project.infillPct}`;

type PrintReportPart = Pick<ScenePart, 'id' | 'name' | 'print'> & { material: PrintMaterial };

export interface PreparedPrintReport {
  entries: Array<{ part: PrintReportPart; shape: PartShape; key: string }>;
  ctx: { project: Pick<ProjectSettings, 'material' | 'infillPct' | 'printProcess'>; printer: PrinterSetup };
  firstStep: ReadonlyMap<string, number>;
}

export function preparePrintReport(
  parts: ScenePart[],
  ctx: PrintContext,
  firstStep = firstSteps(guideStepParts(ctx.scene ?? parts, ctx.project)),
): PreparedPrintReport {
  const printed = parts.filter((p) => p.id !== ctx.project.electronicsBoard?.partId && isPrinted(p) && !p.print?.skip);

  return preparedFromShapes(
    printed.flatMap((part) => {
      const shape = shapes.get(cacheKey(part));

      return shape ? [{ part, shape }] : [];
    }),
    ctx,
    firstStep,
  );
}

export function buildPrintReport(parts: ScenePart[], ctx: PrintContext): PrintReport {
  return buildPreparedPrintReport(preparePrintReport(parts, ctx));
}

export function reportFromShapes(
  entries: Array<{ part: ScenePart; shape: PartShape }>,
  ctx: PrintContext,
  firstStep: ReadonlyMap<string, number> = new Map(),
): PrintReport {
  return buildPreparedPrintReport(preparedFromShapes(entries, ctx, firstStep));
}

function preparedFromShapes(
  entries: Array<{ part: ScenePart; shape: PartShape }>,
  ctx: PrintContext,
  firstStep: ReadonlyMap<string, number>,
): PreparedPrintReport {
  const { material, infillPct, printProcess } = ctx.project;

  return {
    entries: entries.map(({ part, shape }) => ({
      part: {
        id: part.id,
        name: part.name,
        material: printMaterialOf(part, ctx.project),
        print: part.print,
      },
      shape,
      key: shapeKey(part),
    })),
    ctx: { project: { material, infillPct, printProcess }, printer: ctx.printer },
    firstStep,
  };
}

export function buildPreparedPrintReport({ entries, ctx, firstStep }: PreparedPrintReport): PrintReport {
  const byId = new Map(entries.map((entry) => [entry.part.id, entry]));
  const out: PrintedPartReport[] = entries.map(({ part, shape }) => ({
    ...reportPart(part, shape, ctx),
    copies: Math.max(1, part.print?.copies ?? 1),
  }));
  const plan = buildPrintPlan(
    out.map((r) => ({
      ...r,
      shapeKey: byId.get(r.id)!.key,
      print: byId.get(r.id)!.part.print,
      firstStep: firstStep.get(r.id),
    })),
    ctx.printer,
    bedOf(ctx.printer.model, ctx.project.printProcess),
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
    .map(([m, n]) => plural(n, `${m} plate`))
    .join(', ');
  const keepOut = bed.keepOut.length ? `, ${bed.keepOut.map((k) => sizeLabel([k.w, k.d])).join(' and ')} keep-out` : '';

  lines.push(
    `${plural(r.parts.length, 'printed part')} on a ${r.printer.model.name} (${bedSizeText(bed)}${keepOut}): about ${weight(r.totals.grams)} + ${weight(r.totals.supportG)} support, ${duration(r.totals.hours * 3600, 'min')}, ${plates}. Estimates without a slicer.`,
  );
  lines.push(r.totals.failing ? `Issues on ${plural(r.totals.failing, 'part')}:` : 'Every part fits and prints.');

  for (const p of r.parts) {
    const turned = p.check.yaw && p.check.yaw % 90 ? `, turned ${angle(p.check.yaw)} across the plate` : '';
    const head = `- ${p.id} (${p.material}, ${weight(p.grams)}${p.supportG >= 1 ? ` + ${weight(p.supportG)} support` : ''}, ${sizeLabel(p.check.size)}, ${faceText(p.check)}${turned})`;

    const said = [...p.issues, ...p.notes];

    lines.push(said.length ? `${head}: ${said.join('; ')}` : head);
  }

  return lines.join('\n');
}
