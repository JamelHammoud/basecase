import { alignToSkeleton } from '../agent/skeletonMirror';
import { freshOperandIds } from '../booleans/parts';
import type { PartGroup } from '../types/robotLink';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { resolveJoints } from '../utils/kinematics';
import { twinJoints } from './mirrorJoints';
import { mirroredMates } from './mirrorMates';
import { mirroredName } from './mirrorNames';
import { mirrorPart } from './mirrorPart';
import { AGENT_AXIS, type MirrorPlane } from './plane';
import type { MirrorScene } from './planeFor';

export interface MirrorRequest {
  ids: string[];
  plane: MirrorPlane;
  newId: (prefix?: string) => string;
}

export interface MirrorResult {
  copies: ScenePart[];
  joints: RobotJoint[];
}

const SKELETON_PLANE_MM = 0.5;

function groupNamer(newId: MirrorRequest['newId'], axis: ReturnType<typeof sideOf>) {
  const groups = new Map<string, PartGroup>();

  return (group: PartGroup | undefined) => {
    if (!group) return undefined;

    if (!groups.has(group.id)) groups.set(group.id, { id: newId('group'), name: mirroredName(group.name, axis) });

    return groups.get(group.id);
  };
}

const sideOf = (plane: MirrorPlane) => AGENT_AXIS[plane.axis];

function placedCopy(src: ScenePart, id: string, request: MirrorRequest, group: PartGroup | undefined): ScenePart {
  const axis = sideOf(request.plane);
  const copy: ScenePart = {
    ...freshOperandIds(mirrorPart(src, request.plane), () => request.newId()),
    id,
    name: mirroredName(src.name, axis),
    group,
    mirrorOf: { id: src.id, axis },
  };

  delete copy.robotLink;
  delete copy.jointId;
  delete copy.mates;

  return copy;
}

const onSkeletonPlane = ({ axis, offset }: MirrorPlane) => axis !== 1 && Math.abs(offset) < SKELETON_PLANE_MM;

export function mirrorAssembly(scene: MirrorScene, request: MirrorRequest): MirrorResult {
  const { plane, newId } = request;
  const sources = scene.parts.filter((p) => request.ids.includes(p.id));
  const idOf = new Map(sources.map((p) => [p.id, newId()]));
  const groupOf = groupNamer(newId, sideOf(plane));
  const placed = sources.map((src) => placedCopy(src, idOf.get(src.id)!, request, groupOf(src.group)));
  const copies = new Map(sources.map((src, i) => [src.id, placed[i]]));
  const mated = placed.map((copy, i) => {
    const mates = mirroredMates(sources[i], copy, { parts: scene.parts, copies, plane });

    return mates ? { ...copy, mates } : copy;
  });
  const skeleton = onSkeletonPlane(plane) ? scene.skeleton : undefined;
  const aligned = alignToSkeleton(mated, skeleton, sideOf(plane)).copies;
  const twins = twinJoints(resolveJoints(scene.joints ?? [], scene.parts), {
    parts: [...scene.parts, ...aligned],
    idOf,
    plane,
  });

  return {
    copies: aligned.map((copy, i) => {
      const twin = twins.get(sources[i].jointId ?? '');

      return twin ? { ...copy, jointId: twin.id } : copy;
    }),
    joints: [...twins.values()],
  };
}
