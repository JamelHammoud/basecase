import type { DriveClass } from '../sim/driveKeys';
import type { DriveCommand } from '../sim/driveTypes';

export interface PhoneReading {
  tilt: [number, number];
  pad: [number, number] | null;
  buttons: [boolean, boolean];
}

export const PHONE_BUTTONS = ['a', 'b'] as const;

export type PhoneButton = (typeof PHONE_BUTTONS)[number];

export const LEVEL_DEG = 4;
export const FULL_TILT_DEG = 25;

export function tiltAxis(deg: number): number {
  const past = Math.abs(deg) - LEVEL_DEG;

  if (!Number.isFinite(deg) || past <= 0) return 0;

  return Math.sign(deg) * Math.min(1, past / (FULL_TILT_DEG - LEVEL_DEG));
}

export function phoneCommand({ tilt, pad, buttons }: PhoneReading, cls: DriveClass): DriveCommand {
  const forward = tiltAxis(-tilt[0]);
  const left = tiltAxis(-tilt[1]);
  const [padX, padY] = pad ?? [0, 0];

  if (cls === 'arm') return { v: [forward, left, 0], aux: [padY, buttons[0] ? 1 : 0] };

  if (cls === 'rover') return { v: [forward, 0, left] };

  return { v: [forward, -padX, left] };
}

export function pressedButtons(before: PhoneReading['buttons'] | null, now: PhoneReading['buttons']): PhoneButton[] {
  return PHONE_BUTTONS.filter((_, i) => now[i] && !before?.[i]);
}
