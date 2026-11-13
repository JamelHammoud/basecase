import { readinessFingerprint } from '../readiness/readiness';
import { walkPolicy } from '../sim/walkPolicy';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { StoredWalk, WalkSim } from '../utils/engineeringTypes';

export const walkKey = (parts: ScenePart[], project: ProjectSettings) =>
  readinessFingerprint(parts, { joints: project.joints ?? [], policy: walkPolicy(project.policies ?? [])?.id ?? null });

export const storedWalk = (walk: WalkSim, parts: ScenePart[], project: ProjectSettings): StoredWalk => ({
  ...walk,
  key: walkKey(parts, project),
});

export const freshWalk = (parts: ScenePart[], project: ProjectSettings): StoredWalk | undefined =>
  project.walk?.key === walkKey(parts, project) ? project.walk : undefined;
