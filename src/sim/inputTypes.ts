import type { Rig, V3 } from '../utils/kinematics';
import type { DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';

export type PointTable = Record<string, V3>;

export const RAW_INPUT_CAP = 512;

export interface InputLook {
  pan: string;
  tilt: string | null;
  panSign: 1 | -1;
  tiltSign: 1 | -1;
}

export type InputRobot =
  | { kind: 'tip'; start: V3; reachMm: number }
  | { kind: 'joints'; rig: Rig; points: PointTable; joints: string[]; look?: InputLook };

export interface InputMoment {
  cls: DriveClass;
  keys: DriveCommand;
  time?: number;
}

export interface InputSource {
  id: string;
  read: (at: InputMoment) => DriveCommand | null;
  raw?: () => number[] | null;
  pose?: boolean;
  open?: (robot: InputRobot | null) => Promise<string | null>;
  close?: () => void;
}

export const pointKey = (id: string, where: 'bottom' | 'center') => `${where}:${id}`;
