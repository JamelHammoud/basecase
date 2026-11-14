import { useEffect, useEffectEvent, useRef } from 'react';
import type { Case } from '../cases/schema';
import { storedTryOf, type TryContext } from '../cases/tryFile';
import { inStore, moveTries } from '../cases/tryMigration';
import type { TryRecord } from '../cases/tries';
import { deleteTries, keepTries, legacyRecordings, useTries } from '../cases/tryStore';
import { findGripper } from '../cases/gripper';
import { tryFlags } from '../datasets/tryFlags';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { errorMessage } from '../utils/errorMessage';
import type { Setter, ShowToast } from './types';

interface StoredTriesOptions {
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  sceneId: string;
  cases: Case[];
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  showToast: ShowToast;
}

export interface MadeTry {
  record: TryRecord;
  recording: Recording;
  input?: string | null;
}

const SAFE_ID = /^[\w-]{1,128}$/;

function flagsOf(recording: Recording, { sim, rig, parts }: Pick<StoredTriesOptions, 'sim' | 'rig' | 'parts'>) {
  const model = sim.model;

  if (!model || recording.nbody < model.bodies.filter((b) => b.parts.length).length) return [];

  const byId = new Map(parts.map((p) => [p.id, p]));
  const jaws = findGripper(rig, rig.joints, byId)?.jaws.map((j) => j.joint) ?? [];
  const bodies = model.bodies.flatMap((b, i) => (b.parts.length && !b.world?.length ? [i] : []));

  return tryFlags(recording, { model, bodies, skipJoints: jaws });
}

export function useStoredTries(options: StoredTriesOptions) {
  const { project, setProject, sceneId, cases, sim, showToast } = options;
  const catalog = useTries();
  const stored = catalog && new Set(catalog.map((t) => t.id));
  const moving = useRef<string | null>(null);
  const records = project.tries ?? [];
  const needsMove = !!catalog && !project.triesStored && records.length > 0;

  const contextFor = (record: TryRecord, input?: string | null, recording?: Recording): TryContext => ({
    sceneId: SAFE_ID.test(sceneId) ? sceneId : 'scene',
    caseName: cases.find((c) => c.id === record.caseId)?.name ?? record.caseId,
    joints: sim.model?.joints.map((j) => j.id) ?? [],
    ...(input !== undefined ? { input } : {}),
    ...(recording && !record.real ? { flags: flagsOf(recording, options) } : {}),
  });

  const keep = (made: MadeTry[]) =>
    keepTries(
      made.map((m) => ({
        stored: storedTryOf(m.record, contextFor(m.record, m.input, m.recording)),
        recording: m.recording,
      })),
    );

  const add = (made: TryRecord[]) =>
    setProject((p) => ({
      ...p,
      triesStored: p.triesStored || !p.tries?.length,
      tries: [...(p.tries ?? []), ...made],
    }));

  const move = useEffectEvent(async () => {
    try {
      await moveTries(records, (record) => ({ ...contextFor(record), joints: [] }), {
        stored: stored ?? new Set(),
        legacy: legacyRecordings.get,
        dropLegacy: legacyRecordings.delete,
        keep: keepTries,
      });
      setProject((p) => ({ ...p, triesStored: true }));
    } catch (e) {
      moving.current = null;
      showToast(errorMessage(e), { tone: 'error' });
    }
  });

  useEffect(() => {
    if (!needsMove || moving.current === sceneId) return;

    moving.current = sceneId;
    void move();
  }, [needsMove, sceneId, catalog]);

  return {
    shown: (tries: TryRecord[]) => inStore(tries, stored, !!project.triesStored),
    onTry: async (record: TryRecord, recording: Recording, input: string | null) => {
      await keep([{ record, recording, input }]);
      add([record]);
    },
    onTries: async (made: MadeTry[], live: () => boolean) => {
      await keep(made);

      if (!live()) {
        await deleteTries(made.map((m) => m.record.id));

        return;
      }

      add(made.map((m) => m.record));
    },
  };
}
