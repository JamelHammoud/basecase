import { CAMERA_INPUTS } from '../../sim/inputSources';
import type { SimDrive } from '../../sim/useDrive';

export const DRIVE_WITH_CAMERA = 'Drive with Camera';

export async function startDriving(drive: SimDrive, onRefuse: (message: string) => void, inputs?: readonly string[]) {
  if (await drive.start(undefined, inputs ? { inputs } : undefined)) return;

  const refusal = drive.refusal();

  if (refusal) onRefuse(refusal);
}

export const driveWithCamera = (drive: SimDrive, onRefuse: (message: string) => void) =>
  startDriving(drive, onRefuse, CAMERA_INPUTS);
