import type { Training } from '../sim/useTraining';
import { bridgeSnapshots } from '../skills/snapshots';
import { platformBridge } from '../utils/platformBridge';
import type { SceneSkills } from './useSkills';
import type { WatchSubject } from './useTrainingWatch';

const trainerSnapshots = bridgeSnapshots(platformBridge);

export function watchSubject(skills: SceneSkills, training: Training): WatchSubject | null {
  const row = skills.rows.find((r) => r.state.kind === 'training' && !r.state.background);

  if (row?.state.kind === 'training')
    return {
      key: `skill:${row.target}`,
      snapshot: row.state.snapshot,
      robot: null,
      plan: () => skills.watchPlan(row),
      load: skills.loadSnapshot,
    };

  const { watched } = training;

  if (!watched) return null;

  return {
    key: `policy:${watched.snapshot.run}`,
    snapshot: watched.snapshot,
    robot: watched.robot,
    plan: () => ({ start: null, check: null }),
    load: (ref) => trainerSnapshots.load(ref),
  };
}
