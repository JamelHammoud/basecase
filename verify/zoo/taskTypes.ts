import type { Contract } from '../../src/skills/contract';
import type { SignalSource } from '../../src/skills/environment';
import type { BodyClass, Pose, Poser, ZooBody } from './bodies';
import type { Rng } from './rng';

export interface Keyframe {
  t: number;
  pose: Pose;
}

export interface DrawCtx {
  rng: Rng;
  body: ZooBody;
  poser: Poser;
  heightM: number;
}

export interface TaskDraw {
  prompt: string;
  horizonS: number;
  contract: Contract;
  signals: Record<string, SignalSource>;
  intent: Keyframe[];
  restIsGoal?: boolean;
  startOffsetDeg?: number;
}

export type Family = 'move' | 'pose' | 'arm' | 'soft';

export interface ZooTask {
  id: string;
  family: Family;
  classes: readonly BodyClass[];
  say: (rng: Rng) => string;
  draw?: (ctx: DrawCtx) => TaskDraw;
}

export const cm = (m: number) => `${Math.round(m * 100)} cm`;
export const mm = (m: number) => `${Math.round(m * 1000)} mm`;
export const metres = (m: number, rng: Rng) => (rng() < 0.5 ? cm(m) : `${m.toFixed(2)} m`);
export const deg = (rad: number) => `${Math.round((rad * 180) / Math.PI)} degrees`;

export const MOBILE: readonly BodyClass[] = Object.freeze(['wheels', 'legs']);
export const LEGS: readonly BodyClass[] = Object.freeze(['legs']);
export const ARMS: readonly BodyClass[] = Object.freeze(['arm']);
