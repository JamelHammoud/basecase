import type * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { RobotLinkRef } from '../types/robotLink';
import type { ImportedRobot } from '../utils/robotImport';
import { jointsWithoutParts } from '../utils/kinematics';
import { updatedJoints } from './onshapeJoints';
import { placedPart, placementOf, sameShape, samePlace, type Pair } from './onshapePlacement';

export interface OnshapeUpdateInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  groupId: string;
  fresh: ImportedRobot;
}

export interface OnshapeUpdate {
  parts: ScenePart[];
  joints: RobotJoint[];
  changed: ScenePart[];
  changes: number;
}

export const isOnshapePart = (p: ScenePart, groupId: string) => p.group?.id === groupId && !!p.robotLink?.onshape;

function matchParts(old: ScenePart[], fresh: ScenePart[]): { pairs: Pair[]; added: ScenePart[] } {
  const owner = new Map(old.flatMap((p) => (p.robotLink?.onshape ?? []).map((o) => [o, p] as const)));
  const used = new Set<string>();
  const pairs: Pair[] = [];
  const added: ScenePart[] = [];

  for (const f of fresh) {
    const o = (f.robotLink?.onshape ?? []).map((id) => owner.get(id)).find((p) => p && !used.has(p.id));

    if (!o) {
      added.push(f);

      continue;
    }

    used.add(o.id);
    pairs.push({ old: o, fresh: f });
  }

  return { pairs, added };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function linkRef(old: RobotLinkRef, fresh: RobotLinkRef): RobotLinkRef {
  const next = { ...old, link: fresh.link, onshape: fresh.onshape, fixedMates: fresh.fixedMates };

  return Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined)) as unknown as RobotLinkRef;
}

function replaced({ old, fresh }: Pair, placement: THREE.Matrix4): ScenePart {
  const placed = { ...fresh, ...placedPart(fresh, placement) };
  const robotLink = linkRef(old.robotLink!, fresh.robotLink!);
  const same =
    sameShape(old, placed) &&
    samePlace(old, placed) &&
    old.massG === fresh.massG &&
    sameJson(old.com, fresh.com) &&
    sameJson(old.robotLink, robotLink);

  if (same) return old;

  return {
    ...old,
    mesh: fresh.mesh ? { ...fresh.mesh, source: old.mesh?.source ?? fresh.mesh.source } : old.mesh,
    dimensions: fresh.dimensions,
    position: placed.position,
    rotation: placed.rotation,
    massG: fresh.massG,
    com: fresh.com,
    robotLink,
  };
}

function freeId(base: string, taken: Set<string>): string {
  let n = 1;
  const idOf = () => (n === 1 ? base : `${base}_${n}`);

  while (taken.has(idOf())) n++;

  const id = idOf();

  taken.add(id);

  return id;
}

function addedPart(f: ScenePart, at: { old: ScenePart[]; groupId: string; taken: Set<string> }): ScenePart {
  const group = at.old[0]?.group ?? f.group;
  const link = f.robotLink!.link.replace(/[^a-zA-Z0-9_-]+/g, '_');

  return {
    ...f,
    id: freeId(`${at.groupId}-${link}`, at.taken),
    group,
    robotLink: { ...f.robotLink!, robot: at.old[0]?.robotLink?.robot ?? at.groupId },
  };
}

export function planOnshapeUpdate({ parts, joints, groupId, fresh }: OnshapeUpdateInput): OnshapeUpdate {
  const old = parts.filter((p) => isOnshapePart(p, groupId));
  const { pairs, added } = matchParts(old, fresh.parts);
  const placement = placementOf(pairs, old, fresh.parts);
  const taken = new Set(parts.map((p) => p.id));
  const next = new Map(pairs.map((pair) => [pair.old.id, replaced(pair, placement)]));
  const newParts = added.map((f) => {
    const placed = { ...f, ...placedPart(f, placement) };

    return addedPart(placed, { old, groupId, taken });
  });
  const sceneIdOf = new Map([
    ...pairs.map((p) => [p.fresh.id, p.old.id] as const),
    ...added.map((f, i) => [f.id, newParts[i].id] as const),
  ]);
  const removed = new Set(old.filter((p) => !next.has(p.id)).map((p) => p.id));
  const kept = parts.filter((p) => !removed.has(p.id)).map((p) => next.get(p.id) ?? p);
  const nextParts = [...kept, ...newParts];
  const changed = [...next.values(), ...newParts].filter((p) => !parts.includes(p));
  const moved = updatedJoints({
    joints,
    old,
    fresh: fresh.joints,
    sceneIdOf,
    placement,
    before: parts,
    parts: nextParts,
  });
  const nextJoints = jointsWithoutParts(moved.joints, removed) ?? [];

  return {
    parts: nextParts,
    joints: nextJoints,
    changed,
    changes: changed.length + removed.size + moved.changes,
  };
}
