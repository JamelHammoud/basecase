import type { Controller } from './engine';
import type { DriveClass } from './driveKeys';

export function continuationDriveClass(controller: Controller): DriveClass | null {
  if (controller.kind !== 'drive') return null;

  const setup = controller.setup;
  const own = setup.kind === 'team' ? setup.members.find((member) => member.slot === 0)?.setup : setup;

  if (setup.kind === 'team' && setup.members.length !== 1) return null;

  return own && own.kind !== 'legs' ? own.kind : null;
}
