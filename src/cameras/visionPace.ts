import { type Pace } from './streamPace';
import type { VisionAssignment } from './visionFrames';

export function visionCameraPaces(
  assignments: VisionAssignment[],
  cameras: Set<string>,
  now: number,
): Map<string, Pace> {
  const rates = new Map<string, number>();

  for (const assignment of assignments) {
    if (!assignment.continuous || !cameras.has(assignment.camera)) continue;

    rates.set(assignment.camera, Math.max(rates.get(assignment.camera) ?? 0, assignment.fps));
  }

  return new Map(
    [...rates].map(([camera, fps]) => [camera, { interval: 1000 / Math.min(30, Math.max(1, fps)), due: now }]),
  );
}
