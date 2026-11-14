import { useEffect, useEffectEvent } from 'react';
import type { Case } from '../cases/schema';
import { sha256 } from '../cases/tries';
import { hasLegacyTries, migrateTries } from '../cases/tryMigration';
import { loadTries, saveTries, storedTries } from '../cases/tryStore';
import { legacyRecordings } from '../cases/tryStoreWeb';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Setter } from './types';

interface MigrationOptions {
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  sceneId: string;
  cases: Case[];
  sim: Simulation;
  rig: Rig;
}

const migrating = new Set<string>();

export function useTryMigration({ project, setProject, sceneId, cases, sim, rig }: MigrationOptions) {
  const legacy = hasLegacyTries(project.tries);

  const migrate = useEffectEvent(async () => {
    if (migrating.has(sceneId)) return;

    migrating.add(sceneId);

    const entries = project.tries ?? [];
    const model = sim.modelNow();
    const known = new Set((await loadTries()).map((t) => t.id));
    const refs = await migrateTries(
      entries,
      { sceneId, cases, model, modelHash: model && (await sha256(model.xml)), names: (id) => rig.byId.get(id)?.name },
      {
        legacy: legacyRecordings,
        has: (id) => known.has(id) || storedTries().some((t) => t.id === id),
        save: (record, recording) => saveTries([{ record, recording }]),
      },
    ).finally(() => migrating.delete(sceneId));
    const moved = new Set(refs.map((r) => r.id));

    setProject((p) => ({ ...p, tries: (p.tries ?? []).map((t) => (moved.has(t.id) ? { id: t.id } : t)) }));
  });

  useEffect(() => {
    if (legacy) void migrate();
  }, [legacy]);
}
