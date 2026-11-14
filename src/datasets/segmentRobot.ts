import { findGripper } from '../cases/gripper';
import type { EndEffector } from '../cases/robotFit';
import type { SimModel } from '../sim/mjcfTypes';
import type { RobotJoint, ScenePart } from '../types/robotics';
import type { Rig, V3 } from '../utils/kinematics';
import type { SegmentJaw, SegmentMobility, SegmentObject, SegmentRobot } from './segmentFrames';

export interface NamedObject {
  id: string;
  name: string;
  size: V3;
  behavior: string;
}

export interface SegmentScene {
  model: SimModel;
  rig: Rig;
  parts: ScenePart[];
  joints: RobotJoint[];
  effector: EndEffector | null;
  objects: NamedObject[];
  jointQpos?: Int32Array;
}

const MOBILITY: Record<string, SegmentMobility> = { legged: 'legs', 'wheel-legged': 'legs', wheeled: 'wheels' };

const toSi = (joint: RobotJoint | undefined, v: number) =>
  joint?.type === 'prismatic' ? v / 1000 : (v * Math.PI) / 180;

const gripperOf = (scene: SegmentScene) =>
  findGripper(scene.rig, scene.joints, new Map(scene.parts.map((p) => [p.id, p])));

function jawsOf(scene: SegmentScene, gripper: ReturnType<typeof gripperOf>): SegmentJaw[] {
  return (gripper?.jaws ?? []).flatMap((jaw) => {
    const index = scene.model.joints.findIndex((j) => j.id === jaw.joint);
    const joint = scene.rig.byId.get(jaw.joint);

    if (index < 0) return [];

    return [
      {
        actuator: scene.model.joints[index].actuator,
        qpos: scene.jointQpos?.[index] ?? -1,
        open: toSi(joint, jaw.open),
        closed: toSi(joint, jaw.closed),
      },
    ];
  });
}

function effectorOf(scene: SegmentScene) {
  const { effector, model } = scene;
  const body = effector ? model.bodies.findIndex((b) => b.parts.includes(effector.part)) : -1;

  if (!effector || body < 0) return null;

  const origin = model.bodies[body].origin;

  return { body, offset: effector.point.map((v, i) => v - origin[i]) as V3 };
}

function objectsOf(scene: SegmentScene): SegmentObject[] {
  return scene.objects.flatMap((o) => {
    const body = scene.model.bodies.findIndex((b) => b.world?.includes(o.id));

    return o.behavior === 'dynamic' && body >= 0 ? [{ name: o.name, body, sizeMm: Math.max(...o.size) }] : [];
  });
}

export function segmentRobot(scene: SegmentScene): SegmentRobot {
  const { model } = scene;
  const lead = model.robots[0];
  const gripper = gripperOf(scene);
  const jawJoints = new Set(gripper?.jaws.map((j) => j.joint));
  const bodies = model.bodies.flatMap((b, i) =>
    b.parts.length && !b.world?.length && !(b.joint && jawJoints.has(b.joint)) ? [i] : [],
  );
  const root = lead ? model.bodies.findIndex((b) => b.name === lead.root) : -1;

  return {
    bodies,
    root: root >= 0 ? root : null,
    mobility: lead?.floating ? (MOBILITY[lead.morphology] ?? null) : null,
    jaws: jawsOf(scene, gripper),
    effector: effectorOf(scene),
    objects: objectsOf(scene),
  };
}
