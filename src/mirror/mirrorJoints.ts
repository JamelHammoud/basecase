import type { RobotJoint, ScenePart } from '../types/robotics';
import { anchorJoint } from '../utils/kinematics';
import { mirroredName, SIDE_WORDS, swapWords } from './mirrorNames';
import { AGENT_AXIS, flipAxis, reflectPoint, type MirrorPlane, type V3 } from './plane';

export interface JointMirror {
  parts: ScenePart[];
  idOf: Map<string, string>;
  plane: MirrorPlane;
}

export const mirrorsAll = (ids: string[], idOf: Map<string, string>) =>
  ids.length > 0 && ids.every((id) => idOf.has(id));

function mirroredAxis(j: RobotJoint, k: number): V3 {
  const reflected = flipAxis(j.axis, k);

  return j.type === 'revolute' ? (reflected.map((v) => (v === 0 ? 0 : -v)) as V3) : reflected;
}

function freeId(base: string, taken: Set<string>): string {
  let n = 1;

  while (taken.has(n === 1 ? base : `${base}_${n}`)) n++;

  return n === 1 ? base : `${base}_${n}`;
}

function freeIds(twinned: RobotJoint[], joints: RobotJoint[], k: number): Map<string, string> {
  const taken = new Set(joints.map((j) => j.id));
  const out = new Map<string, string>();

  for (const j of twinned) {
    const swapped = swapWords(j.id, SIDE_WORDS[AGENT_AXIS[k as 0 | 1 | 2]]);
    const base = swapped === j.id ? `${j.id}_mirror` : swapped;
    const id = freeId(base, taken);

    taken.add(id);
    out.set(j.id, id);
  }

  return out;
}

function twinOf(j: RobotJoint, ids: Map<string, string>, { parts, idOf, plane }: JointMirror): RobotJoint {
  const map = (list: string[]) => list.map((id) => idOf.get(id) ?? id);
  const actuators = j.actuators?.filter((id) => idOf.has(id)).map((id) => idOf.get(id)!);
  const twin: RobotJoint = {
    ...j,
    id: ids.get(j.id)!,
    name: mirroredName(j.name, AGENT_AXIS[plane.axis]),
    parent: map(j.parent),
    child: map(j.child),
    parentJoint: j.parentJoint ? (ids.get(j.parentJoint) ?? j.parentJoint) : undefined,
    origin: reflectPoint(j.origin, plane),
    axis: mirroredAxis(j, plane.axis),
    actuators: actuators?.length ? actuators : undefined,
  };

  delete twin.onshape;
  delete twin.published;

  return anchorJoint(twin, parts);
}

export function twinJoints(joints: RobotJoint[], mirror: JointMirror): Map<string, RobotJoint> {
  const twinned = joints.filter((j) => mirrorsAll(j.child, mirror.idOf));
  const ids = freeIds(twinned, joints, mirror.plane.axis);

  return new Map(twinned.map((j) => [j.id, twinOf(j, ids, mirror)]));
}
