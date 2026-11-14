import type { V3 } from '../utils/kinematics';

export interface WorldChange {
  id: string;
  position?: V3;
  rotation?: V3;
  visible?: boolean;
  color?: string;
}

export interface WorldLook {
  visible: boolean;
  color: string;
}

export type WorldLooks = Record<string, WorldLook>;

export interface RecordedWorldChange {
  at: number;
  change: WorldChange;
}

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
