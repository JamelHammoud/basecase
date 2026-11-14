import { toScene } from '../agent/agentFrame';
import type { SkeletonView, Vec3 } from '../three/viewport/types';
import type { RobotSkeleton } from '../types/skeleton';
import type { LoadStatus } from '../utils/actuatorRules';
import type { JointMargin } from '../utils/skeletonMargins';
import { percent } from '../../electron/percent.mjs';

export const MARGIN_COLORS: Record<LoadStatus | 'none', string> = {
  pass: '#34d399',
  warn: '#fbbf24',
  fail: '#f87171',
  none: '#d4d4d4',
};

export const marginPercent = (m: JointMargin) => percent(m.margin);

export const marginColor = (m: JointMargin | undefined) => MARGIN_COLORS[m?.status ?? 'none'];

export function skeletonView(skeleton: RobotSkeleton, margins: Map<string, JointMargin>): SkeletonView {
  const byId = new Map(skeleton.joints.map((j) => [j.id, j]));
  const bones = skeleton.joints.flatMap((j): Array<[Vec3, Vec3]> => {
    const parent = j.parent ? byId.get(j.parent) : undefined;
    const up: Array<[Vec3, Vec3]> = parent ? [[toScene(parent.origin), toScene(j.origin)]] : [];

    return j.tip ? [...up, [toScene(j.origin), toScene(j.tip)]] : up;
  });

  return {
    joints: skeleton.joints.map((j) => ({ id: j.id, at: toScene(j.origin), color: marginColor(margins.get(j.id)) })),
    bones,
  };
}
