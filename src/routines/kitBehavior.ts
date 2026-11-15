import type { Motion, TransitionProof } from './schema';
import type { Sampled } from './physicsProver';

export const KIT_BEHAVIOR = Object.freeze({ walkM: 0.08, turnRad: 0.3, stillM: 0.02 });

export interface KitTransitionProof extends TransitionProof {
  failures?: number;
  reason?: string;
}

export const kitTravel = (a: Sampled['start'], b: Sampled['start']) =>
  Math.hypot(b.base[0] - a.base[0], b.base[1] - a.base[1]);

export function kitRequirement(skill: string, move: Motion = {}): string {
  if (skill === 'settle') return `stop within ${KIT_BEHAVIOR.stillM} m`;

  if (skill === 'turn-away')
    return (move.turn ?? 1) > 0
      ? `turn left ${KIT_BEHAVIOR.turnRad} rad in place`
      : `turn right ${KIT_BEHAVIOR.turnRad} rad in place`;

  return (move.speed ?? 1) > 0 ? `walk ${KIT_BEHAVIOR.walkM} m forward` : `walk ${KIT_BEHAVIOR.walkM} m backward`;
}

export const kitFailure = (pair: { from: string; to: string; toMove?: Motion }, failures: number, seeds: number) =>
  `${pair.from} to ${pair.to} didn’t ${kitRequirement(pair.to, pair.toMove)} in ${failures} of ${seeds} tries in simulation.`;

export function kitBehavior(skill: string, sample: Sampled, move: Motion = {}): boolean {
  const { start, late, end } = sample;
  const dx = end.base[0] - start.base[0];
  const dy = end.base[1] - start.base[1];
  const forward = dx * Math.sin(start.yaw) - dy * Math.cos(start.yaw);
  const turned = end.yaw - start.yaw;

  if (skill === 'walk') return Math.sign(move.speed ?? 1) * forward >= KIT_BEHAVIOR.walkM;

  if (skill === 'turn-away')
    return (
      Math.sign(move.turn ?? 1) * turned >= KIT_BEHAVIOR.turnRad &&
      (sample.driftM ?? kitTravel(start, end)) <= KIT_BEHAVIOR.stillM
    );

  return skill === 'settle' && kitTravel(late, end) <= KIT_BEHAVIOR.stillM;
}
