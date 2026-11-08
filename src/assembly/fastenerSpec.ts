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

export type FastenerKind = 'screw' | 'insert' | 'nut' | 'washer' | 'standoff';

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
  kind: 'insert' | 'nut' | 'washer' | 'standoff';
  d: number;
  y0: number;
  y1: number;
  outerR: number;
  studY?: number;
  threadMm?: number;
}

export interface SetScrewSpec {
  id: string;
  d: number;
  y0: number;
  y1: number;
}

export type FastenerSpec = ScrewSpec | SleeveSpec;

export const HEADED_SCREWS = new Set<HardwareType>([
  'socket_head',
  'button_head',
  'countersunk',
  'pan_head',
  'hex_bolt',
]);

const NUTS = new Set<HardwareType>(['hex_nut', 'lock_nut', 'square_nut', 't_nut', 't_nut_8']);
const STANDOFFS = new Set<HardwareType>(['standoff_ff', 'standoff_mf']);
const LONG_THREADS = new Set<HardwareType>(['standoff_ff', 'standoff_mf', 't_nut', 't_nut_8']);
const TAPPED_HARDWARE = new Set<HardwareType>([
  'rail_carriage',
  'extrusion',
  'set_collar',
  'clamp_collar',
  'gt2_pulley',
]);
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
  const d = THREAD[spec.size as keyof typeof THREAD].d;
  const stud = spec.type === 'standoff_mf' ? h - (spec.length ?? 0) : 0;

  return {
    id,
    kind,
    d,
    y0: -h / 2,
    y1: h / 2,
    outerR: sleeveOuter(spec),
    ...(stud > 0 ? { studY: -h / 2 + stud / 2 } : {}),
    ...(LONG_THREADS.has(spec.type) ? { threadMm: Math.min((h - stud) / 2, d) } : {}),
  };
}

function sleeveKind(type: HardwareType): SleeveSpec['kind'] | null {
  if (type === 'heat_insert') return 'insert';

  if (NUTS.has(type)) return 'nut';

  if (STANDOFFS.has(type)) return 'standoff';

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

export type SolidRole = 'printed' | 'component' | 'hardware' | 'tapped';

function setScrewSpec(p: ScenePart): SetScrewSpec[] {
  if (!isUsable(p) || p.hardware!.type !== 'set_screw' || !isMetric(p.hardware!.size)) return [];

  const h = hardwareDimensions(p.hardware!).height;

  return [{ id: p.id, d: THREAD[p.hardware!.size as keyof typeof THREAD].d, y0: -h / 2, y1: h / 2 }];
}

export function fastenerInput(parts: ScenePart[]): {
  specs: FastenerSpec[];
  roles: Record<string, SolidRole>;
  setScrews: SetScrewSpec[];
} {
  const solid = parts.filter((p) => p.role === 'solid' && p.kind !== 'image_plane');

  return {
    specs: fastenerSpecs(solid),
    roles: Object.fromEntries(solid.map((p) => [p.id, solidRole(p)])),
    setScrews: solid.flatMap(setScrewSpec),
  };
}

export function solidRole(p: ScenePart): SolidRole {
  if (p.kind === 'hardware') return p.hardware && TAPPED_HARDWARE.has(p.hardware.type) ? 'tapped' : 'hardware';

  return p.kind === 'component' || p.supplyId ? 'component' : 'printed';
}
