import type { MeshMeasure } from '../three/meshMeasure';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { massOf } from './engineeringMass';
import type { V3 } from './engineeringMath';
import type { PartMass } from './engineeringTypes';
import { nameWords } from './jointNames';
import { buildRig } from './kinematicsRig';

const FLOOR_BAND_MM = 2;
const ATTACHED_WITHIN_MM = 50;
const LEG_WORD = /^[lr]?(hip|knee|ankle|leg|upleg|thigh|shin|foot|toe|calf|haa|hfe|kfe)[lr]?\d*$/;

export const isLegJoint = (j: RobotJoint) =>
  j.limb === 'leg' || (j.limb === undefined && nameWords(j.name).some((w) => LEG_WORD.test(w)));

export interface RobotBody {
  key: string;
  joints: RobotJoint[];
  parts: Set<string>;
  mass: { grams: number; com: V3 };
  legged: boolean;
  feet: ScenePart[];
}

interface BodyInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  measures: Record<string, MeshMeasure | undefined>;
  byId: Map<string, PartMass>;
}

function attached(a: MeshMeasure, b: MeshMeasure) {
  return [0, 1, 2].every((k) => a.min[k] <= b.max[k] + ATTACHED_WITHIN_MM && b.min[k] <= a.max[k] + ATTACHED_WITHIN_MM);
}

function growByNearness(group: Set<string>, loose: Map<string, MeshMeasure>, measures: BodyInput['measures']) {
  const frontier = [...group].flatMap((id) => measures[id] ?? []);

  while (frontier.length) {
    const at = frontier.pop()!;

    for (const [id, m] of loose) {
      if (!attached(at, m)) continue;

      group.add(id);
      loose.delete(id);
      frontier.push(m);
    }
  }
}

function robotGroups({ parts, joints, measures }: BodyInput, solids: ScenePart[]) {
  const rig = buildRig(joints, parts);
  const groups = rig.robots.map((r) => ({
    key: r.key,
    joints: joints.filter((j) => rig.robotOf.get(j.id) === r.key),
    parts: new Set(r.parts),
  }));

  for (const g of groups) g.joints.forEach((j) => j.actuators?.forEach((id) => g.parts.add(id)));

  const claimed = new Set(groups.flatMap((g) => [...g.parts]));
  const loose = new Map(solids.filter((p) => !claimed.has(p.id)).map((p) => [p.id, measures[p.id]!]));

  for (const g of groups) growByNearness(g.parts, loose, measures);

  return groups;
}

function feetOf(solids: ScenePart[], legged: boolean, measures: BodyInput['measures']) {
  const lows = solids.map((p) => measures[p.id]!.min[1]);
  const limit = (legged && lows.length ? Math.min(...lows) : 0) + FLOOR_BAND_MM;

  return solids.filter((p) => measures[p.id]!.min[1] < limit);
}

export function robotBodies(input: BodyInput): RobotBody[] {
  const { parts, joints, measures, byId } = input;
  const solids = parts.filter((p) => p.role === 'solid' && measures[p.id] && !p.physics?.dynamic);
  const inScene = new Set(solids.map((p) => p.id));
  const groups = joints.length
    ? robotGroups(input, solids)
    : [{ key: 'scene', joints: [] as RobotJoint[], parts: inScene }];

  return groups.map((g) => {
    const members = [...g.parts].filter((id) => inScene.has(id));
    const legged = g.joints.some((j) => j.type === 'revolute' && isLegJoint(j));
    const own = solids.filter((p) => g.parts.has(p.id));

    return { ...g, parts: new Set(members), mass: massOf(members, byId), legged, feet: feetOf(own, legged, measures) };
  });
}
