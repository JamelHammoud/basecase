import { goalTargets, type PointOf } from './animationGoals';
import type { IkTarget, Rig, V3 } from './kinematics';

interface GaitTargetInput {
  feet: string[];
  points: V3[];
  pointOf: PointOf;
  keepOrientation: boolean;
}

export function prepareGaitTargets(rig: Rig, input: GaitTargetInput) {
  const feet = input.feet.map((part, i) => {
    const point = input.points[i];
    const targets = goalTargets(
      rig,
      { part, point, target: point, keepOrientation: input.keepOrientation },
      input.pointOf,
    );

    return typeof targets === 'string' ? [] : targets;
  });

  return { feet, all: feet.flat() };
}

export function moveGaitTargets(targets: IkTarget[], desired: V3) {
  if (!targets.length) return;

  const point = targets[0].point;
  const dx = desired[0] - point[0] + 0;
  const dy = desired[1] - point[1] + 0;
  const dz = desired[2] - point[2] + 0;

  targets[0].target[0] = desired[0] + 0;
  targets[0].target[1] = desired[1] + 0;
  targets[0].target[2] = desired[2] + 0;

  for (let i = 1; i < targets.length; i++) {
    const target = targets[i];

    target.target[0] = target.point[0] + dx;
    target.target[1] = target.point[1] + dy;
    target.target[2] = target.point[2] + dz;
  }
}
