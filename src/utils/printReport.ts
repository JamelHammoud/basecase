import { MATERIAL_DENSITY } from '../data/supplies';
import { MeshMeasure, measureTriangles } from '../three/meshMeasure';
import { P1S, PrintCheck, checkPrintability, packPlates, printHours } from '../three/printability';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { filamentGrams, isPrinted, printMaterialOf } from './bom';

const SUPPORT_FILL = 0.2;
const SHELL_MM = 0.9;

export interface PrintedPartReport {
  id: string;
  name: string;
  material: PrintMaterial;
  check: PrintCheck;
  grams: number;
  supportG: number;
  hours: number;
  plate: number;
  issues: string[];
}

export interface PrintReport {
  parts: PrintedPartReport[];
  plates: Partial<Record<PrintMaterial, number>>;
  totals: { grams: number; supportG: number; hours: number; failing: number };
}

export const fmtSize = (size: number[]) =>
  size.map((v) => (v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)))).join(' × ');

const cache = new Map<string, PrintCheck | null>();
const measuresCache = new Map<string, MeshMeasure>();

function shapeKey(p: ScenePart): string {
  const c = p.cad;

  return [
    p.id,
    p.kind,
    JSON.stringify(p.dimensions),
    JSON.stringify(p.deformers ?? null),
    c ? `${c.language}:${c.code.length}:${c.positions.length}:${c.code.slice(-64)}` : '',
    p.sculptMesh?.positions.length ?? 0,
    p.customNodes?.length ?? 0,
  ].join('|');
}

interface PartShape {
  check: PrintCheck;
  measure: MeshMeasure;
}

function shapeOf(part: ScenePart, getTriangles: (id: string) => Float32Array | null): PartShape | null {
  const key = shapeKey(part);
  const cachedCheck = cache.get(key);
  const cachedMeasure = measuresCache.get(key);
  const triangles = cachedCheck === undefined || !cachedMeasure ? getTriangles(part.id) : null;
  const check = cachedCheck === undefined && triangles ? checkPrintability(triangles) : cachedCheck;
  const measure = cachedMeasure ?? (triangles ? measureTriangles(triangles) : undefined);

  if (check && cachedCheck === undefined) cache.set(key, check);

  if (measure && !cachedMeasure) measuresCache.set(key, measure);

  return check && measure ? { check, measure } : null;
}

function issuesFor(check: PrintCheck, grams: number, supportG: number): string[] {
  const issues: string[] = [];

  if (!check.fits) issues.push(check.fitNote ?? 'Too big for the plate. Split it or scale it down.');

  if (check.thinShare > 0.02 || check.minWallMm < P1S.minWallMm * 0.6)
    issues.push(`Thicken walls to 0.84 mm, the thinnest that prints (now ${check.minWallMm.toFixed(2)} mm)`);

  if (supportG > Math.max(2, grams * 0.25))
    issues.push(`Add 45° chamfers or split it flat (needs about ${Math.round(supportG)} g of support)`);

  return issues;
}

function reportPart(part: ScenePart, shape: PartShape, project: ProjectSettings): PrintedPartReport {
  const { check, measure } = shape;
  const material = printMaterialOf(part, project);
  const grams = filamentGrams(measure, material, project.infillPct);
  const supportG = (check.supportMm3 * SUPPORT_FILL * MATERIAL_DENSITY[material]) / 1000;
  const shell = Math.min(measure.volumeMm3, measure.areaMm2 * SHELL_MM);
  const infill = Math.max(0, measure.volumeMm3 - shell) * (project.infillPct / 100);

  return {
    id: part.id,
    name: part.name,
    material,
    check,
    grams,
    supportG,
    hours: printHours({
      shellMm3: shell,
      infillMm3: infill,
      supportMm3: check.supportMm3,
      heightMm: check.size[2],
      material,
    }),
    plate: 0,
    issues: issuesFor(check, grams, supportG),
  };
}

function footprint(r: PrintedPartReport) {
  const diagonal = r.check.yaw !== undefined && r.check.yaw % 90 !== 0;

  return { id: r.id, w: diagonal ? P1S.bed[0] : r.check.size[0], d: diagonal ? P1S.bed[1] : r.check.size[1] };
}

function assignPlates(parts: PrintedPartReport[]): PrintReport['plates'] {
  const plates: PrintReport['plates'] = {};

  for (const material of new Set(parts.map((r) => r.material))) {
    const ofMaterial = parts.filter((r) => r.material === material);
    const packed = packPlates(ofMaterial.filter((r) => r.check.fits).map(footprint));

    plates[material] = packed.plates;

    for (const r of ofMaterial) {
      const plate = packed.plateOf[r.id];

      if (plate !== undefined) r.plate = plate + 1;
    }
  }

  return plates;
}

const sum = (parts: PrintedPartReport[], value: (r: PrintedPartReport) => number) =>
  parts.reduce((total, r) => total + value(r), 0);

export function buildPrintReport(
  parts: ScenePart[],
  project: ProjectSettings,
  getTriangles: (id: string) => Float32Array | null,
): PrintReport {
  if (cache.size > 4000) {
    cache.clear();
    measuresCache.clear();
  }

  const out = parts.filter(isPrinted).flatMap((part) => {
    const shape = shapeOf(part, getTriangles);

    return shape ? [reportPart(part, shape, project)] : [];
  });
  const plates = assignPlates(out);

  out.sort((a, b) => b.issues.length - a.issues.length || b.grams - a.grams);

  return {
    parts: out,
    plates,
    totals: {
      grams: sum(out, (r) => r.grams),
      supportG: sum(out, (r) => r.supportG),
      hours: sum(out, (r) => r.hours),
      failing: out.filter((r) => r.issues.length).length,
    },
  };
}

const TO_AGENT: Record<PrintCheck['up'], string> = {
  '+x': '+x',
  '-x': '-x',
  '+y': '+z',
  '-y': '-z',
  '+z': '-y',
  '-z': '+y',
};

export function printReportText(r: PrintReport): string {
  if (!r.parts.length) return 'No printed parts.';

  const lines: string[] = [];
  const plates = Object.entries(r.plates)
    .map(([m, n]) => `${n} ${m} plate${n === 1 ? '' : 's'}`)
    .join(', ');

  lines.push(
    `${r.parts.length} printed parts on a Bambu Lab P1S (256 × 256 × 250 mm, 18 × 28 mm front-left keep-out): about ${Math.round(r.totals.grams)} g + ${Math.round(r.totals.supportG)} g support, ${r.totals.hours.toFixed(1)} h, ${plates}. Estimates without a slicer.`,
  );
  lines.push(r.totals.failing ? `${r.totals.failing} parts have issues:` : 'Every part fits and prints.');

  for (const p of r.parts) {
    const s = fmtSize(p.check.size);
    const head = `- ${p.id} (${p.material}, ${Math.round(p.grams)} g${p.supportG >= 1 ? ` + ${Math.round(p.supportG)} g support` : ''}, ${s} mm, print with local ${TO_AGENT[p.check.up]} up${p.check.yaw && p.check.yaw % 90 ? `, turned ${p.check.yaw}° across the plate` : ''})`;

    lines.push(p.issues.length ? `${head}: ${p.issues.join('; ')}` : head);
  }

  return lines.join('\n');
}
