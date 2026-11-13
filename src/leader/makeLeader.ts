import * as THREE from 'three';
import { specToPart, toCad, toScene, type AgentPartSpec } from '../agent/agentScene';
import type { V3 } from '../agent/agentFrame';
import type { LeaderLink } from '../types/projectRecords';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { prettyJointName } from '../utils/kinematics';
import { selectionBounds } from '../utils/selection';
import { placeRobot } from '../workspace/robotPlacement';
import { followerArm, type FollowerArm } from './leaderArm';
import { baseCad, handleCad, linkCad, TRIGGER_AT, TRIGGER_RISE, triggerCad } from './leaderCode';
import { frameMatrix, leaderFrames, type ServoFrame } from './leaderFrames';

export const LEADER_SERVO = 'component:dynamixel-xl330-m288';

const DEG = 180 / Math.PI;
const MESH_FROM_SERVO = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 7.5, 11.5);
const SERVO_FROM_MESH = MESH_FROM_SERVO.clone().invert();

export interface Leader {
  name: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  leads: LeaderLink;
}

export interface LeaderInput {
  parts: ScenePart[];
  joints: RobotJoint[];
  sceneId: string;
  robot?: string;
}

const r2 = (v: number) => Math.round(v * 100) / 100 || 0;
const triple = (v: THREE.Vector3): V3 => [r2(v.x), r2(v.y), r2(v.z)];

function poseOf(m: THREE.Matrix4): Pick<AgentPartSpec, 'position' | 'rotation'> {
  const e = new THREE.Euler().setFromRotationMatrix(m, 'XYZ');

  return {
    position: triple(new THREE.Vector3().setFromMatrixPosition(m)),
    rotation: triple(new THREE.Vector3(e.x * DEG, e.y * DEG, e.z * DEG)),
  };
}

interface Built {
  specs: AgentPartSpec[];
  joints: RobotJoint[];
}

function servoSpec(id: string, frame: THREE.Matrix4): AgentPartSpec {
  return { id, catalog: LEADER_SERVO, ...poseOf(frame.clone().multiply(SERVO_FROM_MESH)) };
}

function printed(id: string, name: string, frame: THREE.Matrix4, cad: AgentPartSpec['cad']): AgentPartSpec {
  return { id, name, shape: 'cad_part', material: 'printed', cad, ...poseOf(frame) };
}

function leaderJoint(follower: RobotJoint, origin: THREE.Vector3, link: { parent: string[]; child: string[] }) {
  const joint: RobotJoint = {
    id: follower.id,
    name: follower.name,
    type: follower.type,
    parent: link.parent,
    child: link.child,
    origin: toScene(triple(origin)),
    axis: [...follower.axis],
    actuators: [link.parent[link.parent.length - 1]],
    limb: follower.limb ?? 'arm',
  };

  return follower.range ? { ...joint, range: [...follower.range] as [number, number] } : joint;
}

function triggerFrame(handle: THREE.Matrix4, gripper: RobotJoint): THREE.Matrix4 {
  const local = handle.clone().invert();
  const axis =
    gripper.type === 'revolute'
      ? new THREE.Vector3(...toCad(gripper.axis)).transformDirection(local)
      : new THREE.Vector3(0, 0, 1);
  const hint = new THREE.Vector3(1, 0, 0);
  const x = hint.addScaledVector(axis, -hint.dot(axis));
  const frame: ServoFrame = {
    origin: TRIGGER_AT.clone().addScaledVector(axis, TRIGGER_RISE),
    x: x.lengthSq() > 1e-6 ? x.normalize() : new THREE.Vector3(0, 1, 0).cross(axis).normalize(),
    z: axis,
  };

  return frameMatrix(frame);
}

function armParts(follower: FollowerArm): Built & { handle: THREE.Matrix4 } {
  const { arm } = follower;
  const frames = leaderFrames(arm);
  const servo = (i: number) => `leader-servo-${i + 1}`;
  const holder = (i: number) => (i === 0 ? 'leader-base' : `leader-link-${i}`);
  const handle = frameMatrix(frames.joints[arm.length - 1]);
  const specs: AgentPartSpec[] = [printed('leader-base', 'Base', frameMatrix(frames.joints[0]), baseCad())];
  const joints: RobotJoint[] = [];

  frames.links.forEach((link, i) => {
    specs.push(
      printed(
        `leader-link-${i + 1}`,
        `${prettyJointName(arm[i].name)} link`,
        frameMatrix(frames.joints[i]),
        linkCad(link),
      ),
    );
  });
  arm.forEach((j, i) => {
    const child = i === arm.length - 1 ? 'leader-handle' : `leader-link-${i + 1}`;

    specs.push(servoSpec(servo(i), frameMatrix(frames.cradles[i])));
    joints.push(leaderJoint(j, frames.joints[i].origin, { parent: [holder(i), servo(i)], child: [child] }));
  });

  return { specs, joints, handle };
}

function handParts(handle: THREE.Matrix4, follower: FollowerArm): Built {
  const { gripper } = follower;
  const local = gripper ? triggerFrame(handle, gripper) : null;
  const specs = [printed('leader-handle', 'Handle', handle, handleCad(local))];

  if (!gripper || !local) return { specs, joints: [] };

  const world = handle.clone().multiply(local);
  const origin = new THREE.Vector3().setFromMatrixPosition(world);

  specs.push(servoSpec('leader-servo-trigger', world), printed('leader-trigger', 'Trigger', world, triggerCad()));

  return {
    specs,
    joints: [
      leaderJoint(gripper, origin, { parent: ['leader-handle', 'leader-servo-trigger'], child: ['leader-trigger'] }),
    ],
  };
}

const chained = (joints: RobotJoint[]): RobotJoint[] =>
  joints.map((j, i) => (i ? { ...j, parentJoint: joints[i - 1].id } : j));

function onFloor(parts: ScenePart[], joints: RobotJoint[]) {
  const { min, max } = selectionBounds(parts);
  const shift: V3 = [r2(-(min[0] + max[0]) / 2), r2(-min[1]), r2(-(min[2] + max[2]) / 2)];

  return placeRobot({ parts, joints, shift, takenJointIds: [] });
}

export function buildLeader(follower: FollowerArm, sceneId: string): Leader {
  const name = `${follower.robot.name} Leader`;
  const arm = armParts(follower);
  const hand = handParts(arm.handle, follower);
  const group = { id: 'leader', name };
  const parts = [...arm.specs, ...hand.specs].map((spec) => {
    const part = { ...specToPart(spec), group };

    return part.cad ? { ...part, cad: { ...part.cad, pending: true } } : part;
  });
  const placed = onFloor(parts, chained([...arm.joints, ...hand.joints]));

  return {
    name,
    ...placed,
    leads: { sceneId, robot: follower.robot.key, joints: Object.fromEntries(placed.joints.map((j) => [j.id, j.id])) },
  };
}

export function makeLeader({ parts, joints, sceneId, robot }: LeaderInput): Leader | null {
  const follower = followerArm(parts, joints, robot);

  return follower ? buildLeader(follower, sceneId) : null;
}
