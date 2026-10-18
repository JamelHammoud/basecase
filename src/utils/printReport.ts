/**
 * Print plan for the scene's printed parts on a Bambu Lab P1S: orientation, bed fit, supports,
 * thin walls, filament, time and plates. All estimates (no slicer); the Build tab and the
 * agent's check_printability say so.
 */
import { MATERIAL_DENSITY } from '../data/supplies';
import { MeshMeasure, measureTriangles } from '../three/meshMeasure';
import { P1S, PrintCheck, checkPrintability, packPlates, printHours } from '../three/printability';
import type { PrintMaterial, ProjectSettings, ScenePart } from '../types/robotics';
import { filamentGrams, isPrinted, printMaterialOf } from './bom';

/** Share of the support volume that becomes filament (tree/normal supports at default density) */
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
  /** Plates per material */
  plates: Partial<Record<PrintMaterial, number>>;
  totals: { grams: number; supportG: number; hours: number; failing: number };
}

/** "60 × 40 × 0.5": whole millimeters, with one decimal under 10 mm */
export const fmtSize = (size: number[]) => size.map((v) => (v < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v)))).join(' × ');

const cache = new Map<string, PrintCheck | null>();
const measuresCache = new Map<string, MeshMeasure>();

/** Changes when the part's shape or size changes (not when it moves: checks run in its own frame) */
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

export function buildPrintReport(
  parts: ScenePart[],
  project: ProjectSettings,
  getTriangles: (id: string) => Float32Array | null
): PrintReport {
  if (cache.size > 4000) {
    cache.clear();
    measuresCache.clear();
  }
  const printed = parts.filter(isPrinted);
  const out: PrintedPartReport[] = [];
  for (const p of printed) {
    const key = shapeKey(p);
    let check = cache.get(key);
    let measure: MeshMeasure | null = null;
    const tris = check === undefined || !measuresCache.has(key) ? getTriangles(p.id) : null;
    if (check === undefined) {
      check = tris ? checkPrintability(tris) : null;
      if (check) cache.set(key, check);
    }
    if (measuresCache.has(key)) measure = measuresCache.get(key)!;
    else if (tris) {
      measure = measureTriangles(tris);
      measuresCache.set(key, measure);
    }
    if (!check || !measure) continue;
    const material = printMaterialOf(p, project);
    const grams = filamentGrams(measure, material, project.infillPct);
    const supportG = (check.supportMm3 * SUPPORT_FILL * MATERIAL_DENSITY[material]) / 1000;
    const shell = Math.min(measure.volumeMm3, measure.areaMm2 * SHELL_MM);
    const infill = Math.max(0, measure.volumeMm3 - shell) * (project.infillPct / 100);
    const issues: string[] = [];
    if (!check.fits) issues.push(check.fitNote ?? 'Too big for the plate. Split it or scale it down.');
    if (check.thinShare > 0.02 || check.minWallMm < P1S.minWallMm * 0.6)
      issues.push(`Thicken walls to 0.84 mm, the thinnest that prints (now ${check.minWallMm.toFixed(2)} mm)`);
    if (supportG > Math.max(2, grams * 0.25)) issues.push(`Add 45° chamfers or split it flat (needs about ${Math.round(supportG)} g of support)`);
    out.push({
      id: p.id,
      name: p.name,
      material,
      check,
      grams,
      supportG,
      hours: printHours(shell, infill, check.supportMm3, check.size[2], material),
      plate: 0,
      issues,
    });
  }
  const plates: PrintReport['plates'] = {};
  for (const material of new Set(out.map((r) => r.material))) {
    const items = out.filter((r) => r.material === material && r.check.fits).map((r) => {
      // A part turned across the diagonal takes the whole plate
      const diagonal = r.check.yaw !== undefined && r.check.yaw % 90 !== 0;
      return { id: r.id, w: diagonal ? P1S.bed[0] : r.check.size[0], d: diagonal ? P1S.bed[1] : r.check.size[1] };
    });
    const packed = packPlates(items);
    plates[material] = packed.plates;
    for (const r of out) if (r.material === material && packed.plateOf[r.id] !== undefined) r.plate = packed.plateOf[r.id] + 1;
  }
  out.sort((a, b) => b.issues.length - a.issues.length || b.grams - a.grams);
  return {
    parts: out,
    plates,
    totals: {
      grams: out.reduce((s, r) => s + r.grams, 0),
      supportG: out.reduce((s, r) => s + r.supportG, 0),
      hours: out.reduce((s, r) => s + r.hours, 0),
      failing: out.filter((r) => r.issues.length).length,
    },
  };
}


/** Scene (Y-up) build axis → the agent's Z-up frame */
const TO_AGENT: Record<PrintCheck['up'], string> = { '+x': '+x', '-x': '-x', '+y': '+z', '-y': '-z', '+z': '-y', '-z': '+y' };

export function printReportText(r: PrintReport): string {
  if (!r.parts.length) return 'No printed parts.';
  const lines: string[] = [];
  const plates = Object.entries(r.plates).map(([m, n]) => `${n} ${m} plate${n === 1 ? '' : 's'}`).join(', ');
  lines.push(
    `${r.parts.length} printed parts on a Bambu Lab P1S (256 × 256 × 250 mm, 18 × 28 mm front-left keep-out): about ${Math.round(r.totals.grams)} g + ${Math.round(r.totals.supportG)} g support, ${r.totals.hours.toFixed(1)} h, ${plates}. Estimates without a slicer.`
  );
  lines.push(r.totals.failing ? `${r.totals.failing} parts have issues:` : 'Every part fits and prints.');
  for (const p of r.parts) {
    const s = fmtSize(p.check.size);
    const head = `- ${p.id} (${p.material}, ${Math.round(p.grams)} g${p.supportG >= 1 ? ` + ${Math.round(p.supportG)} g support` : ''}, ${s} mm, print with local ${TO_AGENT[p.check.up]} up${p.check.yaw && p.check.yaw % 90 ? `, turned ${p.check.yaw}° across the plate` : ''})`;
    lines.push(p.issues.length ? `${head}: ${p.issues.join('; ')}` : head);
  }
  return lines.join('\n');
}
