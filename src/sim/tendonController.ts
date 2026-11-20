import type { Controller } from './engine';
import type { DriveSetup } from './drive';
import type { SimJoint } from './mjcfTypes';
import { requireNoTendons } from '../joints/tendonAdmission';

function motorPose(setup: DriveSetup, joints: SimJoint[]): boolean {
  if (setup.kind === 'team') return setup.members.every((member) => motorPose(member.setup, joints));

  if (setup.kind !== 'pose') return false;

  const motors = new Set(
    joints.filter((joint) => joint.robot === setup.robot && joint.actuator >= 0).map((joint) => joint.id),
  );

  return setup.joints.every((joint) => motors.has(joint.id)) && Object.keys(setup.start).every((id) => motors.has(id));
}

export function assertTendonController(controller: Controller, joints: SimJoint[]) {
  if (['hold', 'animation', 'limp'].includes(controller.kind)) return;

  if (controller.kind === 'drive' && motorPose(controller.setup, joints)) return;

  requireNoTendons(joints);
}
