import type { Controller } from './engine';
import type { DriveSetup } from './drive';
import type { SimJoint } from './mjcfTypes';
import { requireNoTendons } from '../joints/tendonAdmission';

function supportedDrive(setup: DriveSetup, joints: SimJoint[]): boolean {
  if (setup.kind === 'team') return setup.members.every((member) => supportedDrive(member.setup, joints));

  const own = joints.filter((joint) => joint.robot === setup.robot);

  if (!own.some((joint) => joint.tendon)) return true;

  if (setup.kind !== 'pose') return false;

  const motors = new Set(own.filter((joint) => joint.actuator >= 0).map((joint) => joint.id));

  return setup.joints.every((joint) => motors.has(joint.id)) && Object.keys(setup.start).every((id) => motors.has(id));
}

export function assertTendonController(controller: Controller, joints: SimJoint[]) {
  if (['hold', 'animation', 'limp'].includes(controller.kind)) return;

  if (controller.kind === 'drive' && supportedDrive(controller.setup, joints)) return;

  requireNoTendons('robot' in controller ? joints.filter((joint) => joint.robot === controller.robot) : joints);
}
