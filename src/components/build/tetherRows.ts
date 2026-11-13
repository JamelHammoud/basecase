import type { Tether } from '../../types/robotics';
import { POWER_CHECK } from '../../utils/engineeringPower';

export type TetherField = keyof Tether;

const READS: Record<string, TetherField[]> = {
  [POWER_CHECK.servoVoltage]: ['volts'],
  [POWER_CHECK.regulatorInput]: ['volts'],
  [POWER_CHECK.supplyCurrent]: ['amps'],
};

export const tetherFieldsFor = (check: string, tether: Tether | undefined): TetherField[] =>
  tether ? (READS[check] ?? []) : [];
