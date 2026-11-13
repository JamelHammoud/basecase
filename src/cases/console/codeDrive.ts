import type { DriveCommand } from '../../sim/driveTypes';

const commands = new Map<object, { command: DriveCommand; at: number }>();
let order = 0;

export function setCodeDrive(owner: object, command: DriveCommand | null) {
  if (command) commands.set(owner, { command, at: ++order });
  else commands.delete(owner);
}

export function codeDriveReading(): DriveCommand | null {
  let newest: { command: DriveCommand; at: number } | null = null;

  for (const entry of commands.values()) if (!newest || entry.at > newest.at) newest = entry;

  return newest?.command ?? null;
}
