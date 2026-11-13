import type { Tether } from '../../types/robotics';

export type TetherField = keyof Tether;

const READS: Record<string, TetherField[]> = {
  'Servo voltage': ['volts'],
  'Regulator input': ['volts'],
  'Supply current': ['amps'],
};

export const tetherFieldsFor = (check: string, tether: Tether | undefined): TetherField[] =>
  tether ? (READS[check] ?? []) : [];
