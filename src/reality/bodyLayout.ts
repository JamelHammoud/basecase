import * as THREE from 'three';
import type { SimBody } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { isMovable, partMatrix, type Rig, type V3 } from '../utils/kinematics';
import { safeId } from '../sim/mjcfText';
import { toMj } from '../sim/mjcfFrames';
import { ownedPartsByJoint } from '../utils/kinematicsMembers';
import type { BodyCalibration, BodyFit } from './bodyTypes';

export const bodyKey = (body: SimBody) => (body.joint ? `joint:${body.joint}` : `root:${body.robot}`);

export function bodyFitForCalibration(
  calibration: BodyCalibration,
  bodies: SimBody[],
  robot: string,
): BodyFit | undefined {
  if (calibration.robot !== robot) return undefined;

  const current = new Map(bodies.filter((body) => body.robot === robot).map((body) => [bodyKey(body), body.name]));
  const rename = (entries: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(entries).map(([name, value]) => {
        const key = calibration.bodyKeys?.[name];

        return [key ? (current.get(key) ?? '') : name, value];
      }),
    );
  const fit = {
    ...calibration.fit,
    massScales: rename(calibration.fit.massScales),
    payloadKg: rename(calibration.fit.payloadKg),
  };

  return bodyFitApplies(fit, bodies, robot) ? fit : undefined;
}

export function bodyFitApplies(fit: BodyFit, bodies: SimBody[], robot: string): boolean {
  const own = new Set(bodies.filter((body) => body.robot === robot).map((body) => body.name));
  const parents = new Set(bodies.map((body) => body.parent));

  return (
    own.size > 0 &&
    Number.isFinite(fit.floorFrictionScale) &&
    fit.floorFrictionScale > 0 &&
    Object.entries(fit.massScales).every(([body, scale]) => own.has(body) && Number.isFinite(scale) && scale > 0) &&
    Object.entries(fit.payloadKg).every(
      ([body, kg]) => own.has(body) && !parents.has(body) && Number.isFinite(kg) && kg >= 0,
    )
  );
}

export function bodyPayloadPosition(body: Pick<SimBody, 'origin' | 'parts'>, parts: ScenePart[]): V3 {
  const origin = new THREE.Vector3(...body.origin);
  let farthest = origin.clone();
  let distance = -1;

  for (const p of parts.filter((p) => body.parts.includes(p.id)).sort((a, b) => a.id.localeCompare(b.id))) {
    const matrix = partMatrix(p);
    const { width, height, depth } = p.dimensions;

    for (let corner = 0; corner < 8; corner++) {
      const at = new THREE.Vector3(
        ((corner & 1 ? 1 : -1) * width) / 2,
        ((corner & 2 ? 1 : -1) * height) / 2,
        ((corner & 4 ? 1 : -1) * depth) / 2,
      ).applyMatrix4(matrix);
      const squared = at.distanceToSquared(origin);

      if (squared <= distance) continue;

      farthest = at;
      distance = squared;
    }
  }

  return farthest.toArray();
}

export function bodyPayloads(bodies: SimBody[], parts: ScenePart[]): Record<string, V3> {
  const parents = new Set(bodies.map((b) => b.parent));

  return Object.fromEntries(
    bodies
      .filter((b) => b.robot && !parents.has(b.name))
      .map((b) => {
        const position = bodyPayloadPosition(b, parts);

        return [b.name, toMj(position.map((v, a) => v - b.origin[a]) as V3)];
      }),
  );
}

export function rigBodies(rig: Rig): SimBody[] {
  const bodies: SimBody[] = [];
  const { children, roots, parts } = bodyMembers(rig);
  let movable = 0;
  const visit = (robot: string, parent: string, joint: string) => {
    const j = rig.byId.get(joint)!;
    const name = `b_j${movable}_${safeId(j.id)}`;

    if (isMovable(j)) movable++;

    bodies.push({
      name,
      origin: j.origin,
      robot,
      parent,
      joint,
      parts: [...(parts.get(joint) ?? [])],
    });

    for (const child of children.get(joint) ?? []) visit(robot, name, child);
  };

  for (const [index, robot] of rig.robots.entries()) {
    const root = `root_${index}`;

    bodies.push({
      name: root,
      origin: robot.pivot,
      robot: robot.key,
      parts: [...robot.parts].filter((id) => !rig.ownerOf.has(id)),
    });

    for (const joint of roots.get(robot.key) ?? []) visit(robot.key, root, joint);
  }

  return bodies;
}

function appendMember(groups: Map<string | undefined, string[]>, key: string | undefined, id: string) {
  const members = groups.get(key) ?? [];

  members.push(id);
  groups.set(key, members);
}

function bodyMembers(rig: Rig) {
  const children = new Map<string | undefined, string[]>();
  const roots = new Map<string | undefined, string[]>();
  const parts = ownedPartsByJoint(rig.ownerOf);

  for (const joint of rig.joints) {
    const parent = rig.parentOf.get(joint.id);

    if (typeof parent === 'string') appendMember(children, parent, joint.id);

    if (!parent) appendMember(roots, rig.robotOf.get(joint.id), joint.id);
  }

  return { children, roots, parts };
}
