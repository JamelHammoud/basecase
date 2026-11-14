import type { RobotMorphology } from './morphology';
import type { SimModel } from './mjcfTypes';

export interface PushRequest {
  type: 'push';
  robot: string;
  force: [number, number, number];
}

const GRAVITY = 9.81;
const STANDING_SHARE = 0.5;
const WHEELED_SHARE = 2;

export const pushShare = (morphology: RobotMorphology | undefined) =>
  morphology === 'wheeled' ? WHEELED_SHARE : STANDING_SHARE;

export function pushRequest(m: SimModel | null, robot: string | undefined, angle: number): PushRequest | null {
  const robots = m?.robots ?? [];
  const target = robot ? robots.find((r) => r.key === robot) : (robots.find((r) => r.floating) ?? robots[0]);
  const key = robot ?? target?.key;

  if (!m || !key) return null;

  const n = (m.massKg[key] || 1) * GRAVITY * pushShare(target?.morphology);

  return { type: 'push', robot: key, force: [Math.cos(angle) * n, 0, Math.sin(angle) * n] };
}
