import type { V3 } from '../utils/kinematics';
import type { DriveSetup } from './drive';
import type { DriveCommand } from './driveTypes';

export const COMMAND_WIDTH = 8;

export interface RecordedCommand {
  v: V3;
  target: V3 | null;
  aux: [number, number];
}

export const commandSlotsOf = (setup: DriveSetup): number =>
  setup.kind === 'team' ? Math.max(0, ...setup.members.map((m) => m.slot)) + 1 : 1;

export function writeCommand(out: Float32Array, at: number, sent: { command?: DriveCommand; aim: V3 | null }) {
  const { command, aim } = sent;
  const v = command?.v ?? [0, 0, 0];
  const target = aim ?? command?.target ?? null;

  out.set(v, at);
  out.set(target ?? [NaN, NaN, NaN], at + 3);
  out[at + 6] = command?.aux?.[0] ?? 0;
  out[at + 7] = command?.aux?.[1] ?? 0;
}

export function readCommand(rows: Float32Array, at: number): RecordedCommand {
  const target: V3 = [rows[at + 3], rows[at + 4], rows[at + 5]];

  return {
    v: [rows[at], rows[at + 1], rows[at + 2]],
    target: Number.isNaN(target[0]) ? null : target,
    aux: [rows[at + 6], rows[at + 7]],
  };
}
