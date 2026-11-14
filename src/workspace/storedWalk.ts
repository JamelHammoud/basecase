import { readinessFingerprint } from '../readiness/readiness';
import { walkPolicy } from '../sim/walkPolicy';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { FallSim, StoredFalls, StoredWalk, WalkSim } from '../utils/engineeringTypes';
import { jsonHash } from '../utils/geometryHash';

export const walkKey = (parts: ScenePart[], project: ProjectSettings) =>
  readinessFingerprint(parts, { joints: project.joints ?? [], policy: walkPolicy(project.policies ?? [])?.id ?? null });

export const storedWalk = (walk: WalkSim, parts: ScenePart[], project: ProjectSettings): StoredWalk => ({
  ...walk,
  key: walkKey(parts, project),
});

export const freshWalk = (parts: ScenePart[], project: ProjectSettings): StoredWalk | undefined =>
  project.walk?.key === walkKey(parts, project) ? project.walk : undefined;

export const fallsKey = (parts: ScenePart[], project: ProjectSettings) =>
  readinessFingerprint(parts, { joints: project.joints ?? [], pose: jsonHash(project.pose ?? null) });

export const storedFalls = (falls: FallSim, parts: ScenePart[], project: ProjectSettings): StoredFalls => ({
  ...falls,
  key: fallsKey(parts, project),
});

export const freshFalls = (parts: ScenePart[], project: ProjectSettings): StoredFalls | undefined =>
  project.falls?.key === fallsKey(parts, project) ? project.falls : undefined;
