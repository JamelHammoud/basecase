import type { ChainResult } from '../assembly/assemblyTypes';
import { chainMembers, isOwnStack } from '../assembly/fastenerMask';
import { heatInsert, type HardwareType } from '../data/hardware';
import type { Coplanar, Interference } from '../three/interference';
import type { ScenePart } from '../types/robotics';

export interface FitInterference extends Interference {
  insert?: { id: string; holeMm: number; needMm: number };
  screw?: { id: string; into: string };
}

const FIT_MARGIN_MM = 0.05;
const SCREWS = new Set<HardwareType>([
  'socket_head',
  'button_head',
  'countersunk',
  'pan_head',
  'hex_bolt',
  'set_screw',
]);

const isPrinted = (p?: ScenePart) => !!p && p.kind !== 'component' && p.kind !== 'hardware';
const insertSpec = (p?: ScenePart) =>
  p?.kind === 'hardware' && p.hardware?.type === 'heat_insert' ? heatInsert(p.hardware) : null;
const isScrew = (p?: ScenePart) => p?.kind === 'hardware' && !!p.hardware && SCREWS.has(p.hardware.type);

function insertFit(i: Interference, byId: Map<string, ScenePart>): FitInterference[] {
  const [id, host] = insertSpec(byId.get(i.a)) ? [i.a, i.b] : [i.b, i.a];
  const spec = insertSpec(byId.get(id))!;

  if (i.depthMm <= (spec.od - spec.hole) / 2 + FIT_MARGIN_MM) return [];

  const holeMm = Math.round((spec.od - 2 * i.depthMm) * 10) / 10;

  return [{ ...i, a: id, b: host, insert: { id, holeMm, needMm: spec.hole } }];
}

function classify(i: Interference, byId: Map<string, ScenePart>): FitInterference[] {
  const [a, b] = [byId.get(i.a), byId.get(i.b)];
  const insertInPrint = (insertSpec(a) && isPrinted(b)) || (insertSpec(b) && isPrinted(a));

  if (insertInPrint) return insertFit(i, byId);

  if (isScrew(a) && b?.kind === 'component') return [{ ...i, screw: { id: i.a, into: i.b } }];

  return isScrew(b) && a?.kind === 'component' ? [{ ...i, screw: { id: i.b, into: i.a } }] : [i];
}

export function designedFits(
  found: { interferences: Interference[]; coplanar: Coplanar[] },
  parts: ScenePart[],
  chains?: ChainResult | null,
): { items: FitInterference[]; coplanar: Coplanar[] } {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const isHardware = (id: string) => byId.get(id)?.kind === 'hardware';
  const members = chains ? chainMembers(chains) : null;
  const designed = (i: Interference) => !!members && isOwnStack(i, members, byId);

  return {
    items: found.interferences.filter((i) => !designed(i)).flatMap((i) => classify(i, byId)),
    coplanar: found.coplanar.filter((c) => !isHardware(c.a) && !isHardware(c.b)),
  };
}
