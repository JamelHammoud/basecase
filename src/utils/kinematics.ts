import * as THREE from 'three';
import type { RobotJoint, RobotPoseState, RootOffset, ScenePart } from '../types/robotics';
import { isZeroRoot, partMatrix, robotRootOffset } from './kinematicsMotion';
import { buildRig, type Rig, type RobotGroup } from './kinematicsRig';

export { buildRig, isMovable, type Rig, type RobotGroup, type V3 } from './kinematicsRig';
export {
  clampJoint,
  forwardKinematics,
  isRestPose,
  jointMotion,
  partMatrix,
  partMotion,
  poseDeltas,
  posedAxis,
  rootMatrix,
  type PosedRig,
} from './kinematicsMotion';
export { preBend, solveIK, type IkOptions, type IkResult, type IkTarget } from './kinematicsIk';
export { jointGroups, nameWords, prettyJointName, sideOf, type Side } from './jointNames';

export function anchorJoint(j: RobotJoint, parts: ScenePart[]): RobotJoint {
  const id = j.parent.find((x) => parts.some((p) => p.id === x)) ?? j.child.find((x) => parts.some((p) => p.id === x));
  const part = id ? parts.find((p) => p.id === id) : undefined;

  if (!part) return { ...j, frame: undefined };

  const inv = partMatrix(part).invert();
  const o = new THREE.Vector3(...j.origin).applyMatrix4(inv);
  const a = new THREE.Vector3(...j.axis).transformDirection(inv);
  const r = (v: number) => Math.round(v * 1e5) / 1e5;

  return { ...j, frame: { part: part.id, origin: [r(o.x), r(o.y), r(o.z)], axis: [r(a.x), r(a.y), r(a.z)] } };
}

export function resolveJoints(joints: RobotJoint[], parts: ScenePart[]): RobotJoint[] {
  if (!joints.some((j) => j.frame)) return joints;

  const byId = new Map(parts.map((p) => [p.id, p]));

  return joints.map((j) => {
    const part = j.frame && byId.get(j.frame.part);

    if (!part) return j;

    const m = partMatrix(part);
    const o = new THREE.Vector3(...j.frame!.origin).applyMatrix4(m);
    const a = new THREE.Vector3(...j.frame!.axis).transformDirection(m);

    return { ...j, origin: [o.x, o.y, o.z], axis: [a.x, a.y, a.z] };
  });
}

export function robotRig(rig: Rig, key: string): Rig {
  const r = rig.robots.find((x) => x.key === key);

  if (!r) return buildRig([], []);

  return buildRig(
    rig.joints.filter((j) => rig.robotOf.get(j.id) === key),
    rig.parts.filter((p) => r.parts.has(p.id)),
  );
}

export function robotOfParts(rig: Rig, ids: string[]): RobotGroup | null {
  for (const id of ids) {
    const key = rig.robotOf.get(id);

    if (key) return rig.robots.find((r) => r.key === key) ?? null;
  }

  return null;
}

export function robotPose(rig: Rig, pose: RobotPoseState | null | undefined, key: string): RobotPoseState {
  const r = rig.robots.find((x) => x.key === key);
  const ids = new Set(r?.joints ?? []);
  const values = Object.fromEntries(Object.entries(pose?.values ?? {}).filter(([id]) => ids.has(id)));

  return { values, root: robotRootOffset(rig, pose, key) };
}

export function withRobotPose(
  rig: Rig,
  pose: RobotPoseState | null | undefined,
  key: string,
  local: RobotPoseState,
): RobotPoseState {
  const r = rig.robots.find((x) => x.key === key);
  const ids = new Set(r?.joints ?? []);
  const values = Object.fromEntries(Object.entries(pose?.values ?? {}).filter(([id]) => !ids.has(id)));

  for (const [id, v] of Object.entries(local.values)) if (ids.has(id)) values[id] = v;

  const roots: Record<string, RootOffset> = { ...pose?.roots };

  if (pose?.root && rig.robots.length === 1 && !roots[rig.robots[0].key]) roots[rig.robots[0].key] = pose.root;

  if (local.root && !isZeroRoot(local.root)) roots[key] = local.root;
  else delete roots[key];

  return { values, ...(Object.keys(roots).length ? { roots } : {}) };
}

export function uniqueJointIds(joints: RobotJoint[], taken: Iterable<string> = []): RobotJoint[] {
  const used = new Set(taken);

  if (!joints.some((j) => used.has(j.id)) && new Set(joints.map((j) => j.id)).size === joints.length) return joints;

  const out: RobotJoint[] = [];
  let batch: RobotJoint[] = [];
  const flush = () => {
    if (!batch.length) return;

    let suffix = '';
    let n = 1;

    while (batch.some((j) => used.has(j.id + suffix))) {
      n++;
      suffix = `_${n}`;
    }

    const rename = new Map(batch.map((j) => [j.id, j.id + suffix]));

    for (const j of batch) {
      const id = rename.get(j.id)!;

      used.add(id);
      out.push(
        suffix
          ? {
              ...j,
              id,
              parentJoint: j.parentJoint && rename.has(j.parentJoint) ? rename.get(j.parentJoint) : j.parentJoint,
            }
          : j,
      );
    }

    batch = [];
  };

  for (const j of joints) {
    if (batch.some((b) => b.id === j.id)) flush();

    batch.push(j);
  }

  flush();

  return out;
}

export function jointsWithoutParts(joints: RobotJoint[] | undefined, deleted: Set<string>): RobotJoint[] | undefined {
  if (
    !joints?.length ||
    !deleted.size ||
    !joints.some((j) => [...j.parent, ...j.child, ...(j.actuators ?? [])].some((id) => deleted.has(id)))
  )
    return joints;

  const gone = new Set<string>();
  const kept: RobotJoint[] = [];

  for (const j of joints) {
    const child = j.child.filter((id) => !deleted.has(id));

    if (j.child.length && !child.length) {
      gone.add(j.id);

      continue;
    }

    const parent = j.parent.filter((id) => !deleted.has(id));
    const actuators = j.actuators?.filter((id) => !deleted.has(id));
    const frame = j.frame && deleted.has(j.frame.part) ? undefined : j.frame;

    kept.push({ ...j, parent, child, ...(actuators ? { actuators } : {}), frame });
  }

  let out = kept.map((j) => (j.parentJoint && gone.has(j.parentJoint) ? { ...j, parentJoint: undefined } : j));

  for (let changed = true; changed;) {
    const used = new Set(out.map((j) => j.parentJoint).filter(Boolean));
    const next = out.filter((j) => j.parent.length || j.child.length || used.has(j.id));

    changed = next.length !== out.length;
    out = next;
  }

  return out;
}

export const jointUnit = (j: RobotJoint) => (j.type === 'prismatic' ? 'mm' : '°');

export function linkParts(rig: Rig, jointId: string): string[] {
  return [...rig.ownerOf].filter(([, j]) => j === jointId).map(([p]) => p);
}
