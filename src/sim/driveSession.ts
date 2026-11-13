import { pointOfFor } from '../agent/agentPoseShared';
import { pointTable } from '../cameras/operator/pointTable';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { Rig } from '../utils/kinematics';
import { rigForWorker, tipOf, type RobotDrive } from './drive';
import type { DriveAccess } from './driveAccess';
import type { PoseSetup } from './drivePose';
import type { InputRobot } from './inputTypes';

type Granted = Extract<DriveAccess, { kind: 'ready' | 'policy' }>;

const poseOf = (access: Granted): PoseSetup | RobotDrive | null =>
  access.kind === 'policy' ? (access.pose ?? null) : access.setup;

export function inputRobot(access: Granted, scene: { rig: Rig; viewport: Viewport3DHandle | null }): InputRobot | null {
  const setup = poseOf(access);

  if (setup?.kind === 'arm') return { kind: 'tip', start: tipOf(setup, setup.start), reachMm: setup.reachMm };

  if (setup?.kind !== 'pose') return null;

  const { rig, viewport } = scene;

  return {
    kind: 'joints',
    rig: rigForWorker(rig),
    points: pointTable(rig, pointOfFor(rig, viewport), setup.robot),
    joints: setup.joints.map((j) => j.id),
  };
}

export const pinFor = (access: DriveAccess): string | null => (access.kind === 'ready' ? (access.pin ?? null) : null);
