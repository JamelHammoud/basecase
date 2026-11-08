import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { partMatrix, type Rig } from '../utils/kinematics';
import { partBounds } from '../utils/selection';

const SUNK_MM = 2;

type Box = ReturnType<typeof partBounds>;

type Triangles = (id: string) => Float32Array | null;

interface Host {
  robot: number;
  owner: string | undefined;
}

const localBoxes = new WeakMap<Float32Array, THREE.Box3>();

function localBox(tris: Float32Array): THREE.Box3 {
  const known = localBoxes.get(tris);

  if (known) return known;

  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  for (let i = 0; i < tris.length; i += 3) box.expandByPoint(v.set(tris[i], tris[i + 1], tris[i + 2]));

  localBoxes.set(tris, box);

  return box;
}

function placedBounds(p: ScenePart, triangles: Triangles): Box {
  const tris = triangles(p.id);

  if (!tris || tris.length < 9) return partBounds(p);

  const box = localBox(tris).clone().applyMatrix4(partMatrix(p));

  return { min: box.min.toArray(), max: box.max.toArray() };
}

const volume = (b: Box) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);

const sunkInto = (a: Box, b: Box) =>
  [0, 1, 2].every((axis) => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) >= SUNK_MM);

function enclosing(boxes: Box[]): Box {
  const pick = (axis: number, side: 'min' | 'max') =>
    (side === 'min' ? Math.min : Math.max)(...boxes.map((b) => b[side][axis]));

  return {
    min: [pick(0, 'min'), pick(1, 'min'), pick(2, 'min')],
    max: [pick(0, 'max'), pick(1, 'max'), pick(2, 'max')],
  };
}

interface Scene {
  rig: Rig;
  byId: Map<string, ScenePart>;
  bounds: (p: ScenePart) => Box;
}

function hostOf(part: ScenePart, { rig, byId, bounds }: Scene): Host | null {
  const box = bounds(part);

  for (const [robot, group] of rig.robots.entries()) {
    const members = [...group.parts].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const boxes = members.map((m) => ({ id: m.id, box: bounds(m) }));
    const smaller = volume(box) < volume(enclosing(boxes.map((b) => b.box)));
    const touched = boxes.find((m) => sunkInto(box, m.box));

    if (smaller && touched) return { robot, owner: rig.ownerOf.get(touched.id) };
  }

  return null;
}

export const isSolidPart = (p: ScenePart) => p.visible && p.role === 'solid' && p.kind !== 'image_plane';

const looseFixed = (p: ScenePart, rig: Rig) => !rig.bodyParts.has(p.id) && !p.physics?.dynamic && isSolidPart(p);

export function adoptEmbeddedParts(rig: Rig, parts: ScenePart[], triangles: Triangles): Rig {
  const candidates = parts.filter((p) => looseFixed(p, rig));

  if (!candidates.length || !rig.robots.length) return rig;

  const scene: Scene = { rig, byId: new Map(parts.map((p) => [p.id, p])), bounds: (p) => placedBounds(p, triangles) };
  const hosted = candidates.flatMap((p) => {
    const host = hostOf(p, scene);

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
