import type { Rig, V3 } from '../utils/kinematics';
import type { DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';

export type PointTable = Record<string, V3>;

export type InputRobot =
  { kind: 'tip'; start: V3; reachMm: number } | { kind: 'joints'; rig: Rig; points: PointTable; joints: string[] };

export interface InputMoment {
  cls: DriveClass;
  keys: DriveCommand;
}

export interface InputSource {
  id: string;
  read: (at: InputMoment) => DriveCommand | null;
  pose?: boolean;
  open?: (robot: InputRobot) => Promise<string | null>;
  close?: () => void;
}

export const pointKey = (id: string, where: 'bottom' | 'center') => `${where}:${id}`;
