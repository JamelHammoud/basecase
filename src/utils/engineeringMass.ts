import { componentWeightG } from '../data/components';
import { HardwareSpec, hardwareFinish } from '../data/hardware';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { MeshMeasure } from '../three/meshMeasure';
import type { ProjectSettings, RobotJoint, ScenePart } from '../types/robotics';
import { filamentGrams, isPrinted, isStandIn, printMaterialOf } from './bom';
import { V3, rotateEuler } from './engineeringMath';
import type { PartMass } from './engineeringTypes';

const FINISH_DENSITY: Record<string, number> = {
  black: 7.85,
  zinc: 7.85,
  steel: 7.85,
  stainless: 8.0,
  brass: 8.5,
  nylon: 1.15,
};
const OTHER_DENSITY: Record<string, number> = { 'CNC Aluminum': 2.7, 'Laser-Cut Acrylic/Carbon': 1.4 };

type Mass = Omit<PartMass, 'id'>;

const hardwareDensity = (h: HardwareSpec) => (h.type === 'bearing' ? 7.8 : (FINISH_DENSITY[hardwareFinish(h)] ?? 7.85));

function publishedCom(p: ScenePart, at: V3): V3 {
  return p.com ? (rotateEuler(p.com, p.rotation).map((v, i) => v + p.position[i]) as V3) : at;
}

function catalogMass(componentId: string, cm3: number, at: V3): Mass {
  const g = componentWeightG(componentId);

  return g !== undefined
    ? { grams: g, centroid: at, source: 'catalog' }
    : { grams: cm3 * 1.2, centroid: at, source: 'estimate' };
}

function boughtMass(p: ScenePart, cm3: number, at: V3): Mass | undefined {
  if (p.massG) return { grams: p.massG, centroid: publishedCom(p, at), source: 'published' };

  if (p.kind === 'component' && p.componentId) return catalogMass(p.componentId, cm3, at);

  if (p.kind === 'hardware' && p.hardware)
    return { grams: cm3 * hardwareDensity(p.hardware), centroid: at, source: 'hardware' };

  const s = p.supplyId ? SUPPLY_BY_ID[p.supplyId] : undefined;

  if (!s) return undefined;

  return s.weightG
    ? { grams: s.weightG, centroid: at, source: 'supply' }
    : { grams: cm3 * 1.5, centroid: at, source: 'estimate' };
}

function madeMass(p: ScenePart, m: MeshMeasure, project: ProjectSettings, cm3: number): Mass | undefined {
  const at = m.centroid;

  if (isPrinted(p))
    return { grams: filamentGrams(m, printMaterialOf(p, project), project.infillPct), centroid: at, source: 'printed' };

  if (p.mechanicalTag && OTHER_DENSITY[p.mechanicalTag])
    return { grams: cm3 * OTHER_DENSITY[p.mechanicalTag], centroid: at, source: 'estimate' };

  if (isStandIn(p) || p.mechanicalTag === 'Off-the-shelf COTS')
    return { grams: cm3 * 1.2, centroid: at, source: 'estimate' };

  return undefined;
}

export function partMasses(
  parts: ScenePart[],
  project: ProjectSettings,
  measures: Record<string, MeshMeasure | undefined>,
): PartMass[] {
  const out: PartMass[] = [];

  for (const p of parts) {
    const m = measures[p.id];

    if (p.role !== 'solid' || p.kind === 'image_plane' || !m) continue;

    const cm3 = m.volumeMm3 / 1000;
    const mass = boughtMass(p, cm3, m.centroid) ?? madeMass(p, m, project, cm3);

    if (mass) out.push({ id: p.id, ...mass });
  }

  return out;
}

export function massOf(ids: Iterable<string>, byId: Map<string, PartMass>): { grams: number; com: V3 } {
  let g = 0;
  const c: V3 = [0, 0, 0];

  for (const id of ids) {
    const m = byId.get(id);

    if (!m) continue;

    g += m.grams;
    c[0] += m.grams * m.centroid[0];
    c[1] += m.grams * m.centroid[1];
    c[2] += m.grams * m.centroid[2];
  }

  return { grams: g, com: g ? [c[0] / g, c[1] / g, c[2] / g] : [0, 0, 0] };
}

export function downstreamOf(joint: RobotJoint, joints: RobotJoint[]): Set<string> {
  const set = new Set(joint.child);
  const grows = (k: RobotJoint) =>
    k !== joint && !k.child.every((id) => set.has(id)) && k.parent.some((id) => set.has(id));
  let grew = true;

  while (grew) {
    grew = false;

    for (const k of joints) {
      if (!grows(k)) continue;

      k.child.forEach((id) => set.add(id));
      grew = true;
    }
  }

  return set;
}
