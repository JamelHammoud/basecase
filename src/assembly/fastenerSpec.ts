import {
  hardwareDimensions,
  heatInsert,
  isMetric,
  screwHead,
  THREAD,
  WASHER,
  LARGE_WASHER,
  type HardwareSpec,
  type HardwareType,
} from '../data/hardware';
import type { ScenePart } from '../types/robotics';

export type FastenerKind = 'screw' | 'insert' | 'nut' | 'washer';

export interface ScrewSpec {
  id: string;
  kind: 'screw';
  d: number;
  tipY: number;
  underY: number;
  topY: number;
  headR: number;
  countersunk: boolean;
}

export interface SleeveSpec {
  id: string;
  kind: 'insert' | 'nut' | 'washer';
  d: number;
  y0: number;
  y1: number;
  outerR: number;
}

export type FastenerSpec = ScrewSpec | SleeveSpec;

export const HEADED_SCREWS = new Set<HardwareType>([
  'socket_head',
  'button_head',
  'countersunk',
  'pan_head',
  'hex_bolt',
]);

const NUTS = new Set<HardwareType>(['hex_nut', 'lock_nut', 'square_nut']);
const WASHERS = new Set<HardwareType>(['washer', 'large_washer']);

const isUsable = (p: ScenePart) => p.kind === 'hardware' && !!p.hardware && p.role === 'solid';

function headRadius(spec: HardwareSpec): number {
  if (spec.type === 'hex_bolt') return hardwareDimensions(spec).width / 2;

  return (screwHead(spec)?.dk ?? THREAD[spec.size as keyof typeof THREAD].d * 1.8) / 2;
}

function screwSpec(id: string, spec: HardwareSpec): ScrewSpec {
  const h = hardwareDimensions(spec).height;
  const L = spec.length ?? 0;
  const countersunk = spec.type === 'countersunk';
  const k = countersunk ? (screwHead(spec)?.k ?? 0) : h - L;

  return {
    id,
    kind: 'screw',
    d: THREAD[spec.size as keyof typeof THREAD].d,
    tipY: -h / 2,
    underY: h / 2 - k,
    topY: h / 2,
    headR: headRadius(spec),
    countersunk,
  };
}

function sleeveOuter(spec: HardwareSpec): number {
  if (spec.type === 'heat_insert') return heatInsert(spec).od / 2;

  if (WASHERS.has(spec.type)) return ((spec.type === 'washer' ? WASHER : LARGE_WASHER)[spec.size as 'M3']?.d2 ?? 6) / 2;

  return hardwareDimensions(spec).width / 2;
}

function sleeveSpec(id: string, spec: HardwareSpec, kind: SleeveSpec['kind']): SleeveSpec {
  const h = hardwareDimensions(spec).height;

  return { id, kind, d: THREAD[spec.size as keyof typeof THREAD].d, y0: -h / 2, y1: h / 2, outerR: sleeveOuter(spec) };
}

function sleeveKind(type: HardwareType): SleeveSpec['kind'] | null {
  if (type === 'heat_insert') return 'insert';

  if (NUTS.has(type)) return 'nut';

  return WASHERS.has(type) ? 'washer' : null;
}

export function fastenerSpec(p: ScenePart): FastenerSpec | null {
  if (!isUsable(p) || !isMetric(p.hardware!.size)) return null;

  const spec = p.hardware!;

  if (HEADED_SCREWS.has(spec.type)) return screwSpec(p.id, spec);

  const kind = sleeveKind(spec.type);

  return kind ? sleeveSpec(p.id, spec, kind) : null;
}

export const fastenerSpecs = (parts: ScenePart[]): FastenerSpec[] =>
  parts.map(fastenerSpec).filter((s): s is FastenerSpec => s !== null);

export const isFastenerPart = (p: ScenePart) => fastenerSpec(p) !== null;

export type SolidRole = 'printed' | 'component' | 'hardware';

export function fastenerInput(parts: ScenePart[]): { specs: FastenerSpec[]; roles: Record<string, SolidRole> } {
  const solid = parts.filter((p) => p.role === 'solid' && p.kind !== 'image_plane');

  return { specs: fastenerSpecs(solid), roles: Object.fromEntries(solid.map((p) => [p.id, solidRole(p)])) };
}

export function solidRole(p: ScenePart): SolidRole {
  if (p.kind === 'hardware') return 'hardware';

  return p.kind === 'component' || p.supplyId ? 'component' : 'printed';
}
