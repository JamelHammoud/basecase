import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { partBounds } from '../utils/selection';

const SUNK_MM = 2;

type Box = ReturnType<typeof partBounds>;

interface Host {
  robot: number;
  owner: string | undefined;
}

const volume = (b: Box) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);

const sunkInto = (a: Box, b: Box) =>
  [0, 1, 2].every((axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) >= SUNK_MM);

function robotBox(boxes: Box[]): Box {
  const pick = (axis: number, side: 'min' | 'max') =>
    (side === 'min' ? Math.min : Math.max)(...boxes.map((b) => b[side][axis]));

  return {
    min: [pick(0, 'min'), pick(1, 'min'), pick(2, 'min')],
    max: [pick(0, 'max'), pick(1, 'max'), pick(2, 'max')],
  };
}

function hostOf(part: ScenePart, rig: Rig, byId: Map<string, ScenePart>): Host | null {
  const box = partBounds(part);

  for (const [robot, group] of rig.robots.entries()) {
    const members = [...group.parts].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const smaller = volume(box) < volume(robotBox(members.map(partBounds)));
    const touched = members.find((m) => sunkInto(box, partBounds(m)));

    if (smaller && touched) return { robot, owner: rig.ownerOf.get(touched.id) };
  }

  return null;
}

export const isSolidPart = (p: ScenePart) => p.visible && p.role === 'solid' && p.kind !== 'image_plane';

const looseFixed = (p: ScenePart, rig: Rig) => !rig.bodyParts.has(p.id) && !p.physics?.dynamic && isSolidPart(p);

export function adoptEmbeddedParts(rig: Rig, parts: ScenePart[]): Rig {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const hosted = parts.flatMap((p) => {
    const host = looseFixed(p, rig) ? hostOf(p, rig, byId) : null;

    return host ? [{ id: p.id, ...host }] : [];
  });

  if (!hosted.length) return rig;

  const ownerOf = new Map(rig.ownerOf);
  const robots = rig.robots.map((group) => ({ ...group, parts: new Set(group.parts) }));

  for (const { id, robot, owner } of hosted) {
    robots[robot].parts.add(id);

    if (owner) ownerOf.set(id, owner);
  }

  return { ...rig, ownerOf, robots, bodyParts: new Set(robots.flatMap((r) => [...r.parts])) };
}
