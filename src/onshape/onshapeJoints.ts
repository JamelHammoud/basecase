import type * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint, resolveJoints } from '../utils/kinematics';
import { placedJoint, sameJointPlace } from './onshapePlacement';

export interface JointUpdateInput {
  joints: RobotJoint[];
  old: ScenePart[];
  fresh: RobotJoint[];
  sceneIdOf: Map<string, string>;
  placement: THREE.Matrix4;
  before: ScenePart[];
  parts: ScenePart[];
}

interface JointBuild extends JointUpdateInput {
  oldIds: Set<string>;
  partIds: Set<string>;
  jointIdOf: Map<string, string>;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const mineIn = (oldIds: Set<string>) => (j: RobotJoint) =>
  !!j.onshape && [...j.parent, ...j.child].some((id) => oldIds.has(id));

function freeJointId(base: string, taken: Set<string>): string {
  let n = 1;
  const idOf = () => (n === 1 ? base : `${base}_${n}`);

  while (taken.has(idOf())) n++;

  taken.add(idOf());

  return idOf();
}

function jointIds(b: Omit<JointBuild, 'jointIdOf'>, mine: RobotJoint[]): Map<string, string> {
  const byMate = new Map(mine.map((j) => [j.onshape!.mate, j.id]));
  const taken = new Set(b.joints.map((j) => j.id));

  return new Map(b.fresh.map((f) => [f.id, byMate.get(f.onshape?.mate ?? '') ?? freeJointId(f.id, taken)] as const));
}

function ends(b: JointBuild, freshIds: string[], oldIds: string[] = []): string[] {
  const mapped = freshIds.map((id) => b.sceneIdOf.get(id)).filter((id): id is string => !!id);
  const kept = oldIds.filter((id) => !b.oldIds.has(id) && b.partIds.has(id) && !mapped.includes(id));

  return [...mapped, ...kept];
}

function nextJoint(b: JointBuild, f: RobotJoint, was: RobotJoint | undefined): RobotJoint {
  const joint: RobotJoint = {
    ...was,
    ...f,
    ...placedJoint(f, b.placement),
    id: b.jointIdOf.get(f.id)!,
    parent: ends(b, f.parent, was?.parent),
    child: ends(b, f.child, was?.child),
    parentJoint: f.parentJoint ? b.jointIdOf.get(f.parentJoint) : undefined,
    actuators: was?.actuators,
    effortNm: was?.effortNm ?? f.effortNm,
    velocity: was?.velocity ?? f.velocity,
    limb: was?.limb ?? f.limb,
    onshape: f.onshape,
  };

  return anchorJoint(joint, b.parts);
}

function unchanged(was: RobotJoint, next: RobotJoint, parts: ScenePart[]): boolean {
  const [resolved] = resolveJoints([was], parts);
  const fields = (j: RobotJoint) => [j.name, j.type, j.parent, j.child, j.parentJoint, j.range, j.onshape];

  return sameJointPlace(resolved, next) && sameJson(fields(was), fields(next));
}

export function updatedJoints(input: JointUpdateInput): { joints: RobotJoint[]; changes: number } {
  const oldIds = new Set(input.old.map((p) => p.id));
  const mine = input.joints.filter(mineIn(oldIds));
  const base = { ...input, oldIds, partIds: new Set(input.parts.map((p) => p.id)) };
  const b: JointBuild = { ...base, jointIdOf: jointIds(base, mine) };
  const freshMates = new Set(input.fresh.map((f) => f.onshape?.mate));
  const byId = new Map(input.joints.map((j) => [j.id, j]));
  const out = new Map<string, RobotJoint>();
  let changes = 0;

  for (const f of input.fresh) {
    const was = byId.get(b.jointIdOf.get(f.id)!);
    const next = nextJoint(b, f, was);
    const same = !!was && unchanged(was, next, input.before);

    out.set(next.id, same ? was : next);
    changes += same ? 0 : 1;
  }

  for (const j of mine.filter((j) => !freshMates.has(j.onshape!.mate) && !j.onshape!.gone)) {
    out.set(j.id, { ...j, onshape: { mate: j.onshape!.mate, gone: true } });
    changes++;
  }

  const joints = [...input.joints.map((j) => out.get(j.id) ?? j), ...[...out.values()].filter((j) => !byId.has(j.id))];

  return { joints, changes };
}
