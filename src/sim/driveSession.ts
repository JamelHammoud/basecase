import { pointOfFor } from '../agent/agentPoseShared';
import { lookJoints } from '../cameras/operator/lookJoints';
import { pointTable } from '../cameras/operator/pointTable';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { rigForWorker, tipOf, type RobotDrive } from './drive';
import type { DriveAccess } from './driveAccess';
import type { PoseSetup } from './drivePose';
import type { InputRobot } from './inputTypes';

type Granted = Extract<DriveAccess, { kind: 'ready' | 'policy' }>;

const poseOf = (access: Granted): PoseSetup | RobotDrive | null =>
  access.kind === 'policy' ? (access.pose ?? null) : access.setup;

export interface InputScene {
  rig: Rig;
  parts: ScenePart[];
  viewport: Viewport3DHandle | null;
}

export function inputRobot(access: Granted, scene: InputScene): InputRobot | null {
  const setup = poseOf(access);

  if (setup?.kind === 'arm') return { kind: 'tip', start: tipOf(setup, setup.start), reachMm: setup.reachMm };

  if (setup?.kind !== 'pose') return null;

  const { rig, parts, viewport } = scene;
  const look = lookJoints(rig, parts, setup.robot);

  return {
    kind: 'joints',
    rig: rigForWorker(rig),
    points: pointTable(rig, pointOfFor(rig, viewport), setup.robot),
    joints: setup.joints.map((j) => j.id),
    ...(look ? { look } : {}),
  };
}

export const pinFor = (access: DriveAccess): string | null => (access.kind === 'ready' ? (access.pin ?? null) : null);
