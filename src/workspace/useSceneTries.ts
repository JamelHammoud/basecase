import { useEffect, useEffectEvent, useRef } from 'react';
import { filmBoxes } from '../cases/filmstrip';
import { drawTryFilm } from '../cases/filmstripClient';
import { readCases } from '../cases/schema';
import { contractHash, legacyRecords, sceneTries, storedTry, tryJoints, type TryRef } from '../cases/storedTry';
import { sha256, type TryDraft, type TryRecord } from '../cases/tries';
import { migratedRefs, migrateTries } from '../cases/tryMigration';
import { deleteTries, keepTry, storedTriesNow } from '../cases/tryStore';
import { dropLegacyRecording, legacyRecording } from '../cases/tryStoreIdb';
import type { SimModel } from '../sim/mjcfTypes';
import type { Simulation } from '../sim/useSimulation';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import type { Setter, ShowToast } from './types';
import { useStoredTries } from './useStoredTries';

interface SceneTriesOptions {
  project: ProjectSettings;
  setProject: Setter<ProjectSettings>;
  sceneId: string;
  sim: Simulation;
  parts: ScenePart[];
  showToast: ShowToast;
}

const withoutRefs = (refs: TryRef[] | undefined, gone: Set<string>) => (refs ?? []).filter((t) => !gone.has(t.id));

const modelOf = async (sim: Simulation): Promise<SimModel | null> =>
  sim.modelNow() ?? (await sim.buildModel().catch(() => null));

async function filmOf(draft: TryDraft, shot: { model: SimModel | null; boxes: ReturnType<typeof filmBoxes> }) {
  if (!shot.model || draft.record.real) return undefined;

  return (await drawTryFilm({ model: shot.model, recording: draft.recording, boxes: shot.boxes })) ?? undefined;
}

function useTryMigration({ project, setProject, sceneId, sim }: SceneTriesOptions) {
  const pending = legacyRecords(project.tries).length > 0;
  const running = useRef(false);

  const migrate = useEffectEvent(async () => {
    const model = await modelOf(sim);
    const moved = await migrateTries(legacyRecords(project.tries), {
      sceneId,
      cases: readCases(project.cases),
      model: model && { hash: await sha256(model.xml), joints: tryJoints(model) },
      legacy: IS_WEB_DEMO ? null : { load: legacyRecording, drop: dropLegacyRecording },
      keep: keepTry,
    });

    if (moved.size) setProject((p) => ({ ...p, tries: migratedRefs(p.tries, moved) }));
  });

  useEffect(() => {
    if (!pending || running.current) return;

    running.current = true;
    void migrate().finally(() => {
      running.current = false;
    });
  }, [pending]);
}

export function useSceneTries(options: SceneTriesOptions) {
  const { project, setProject, sceneId, sim, parts, showToast } = options;
  const stored = useStoredTries();

  useTryMigration(options);

  const add = async (drafts: TryDraft[]) => {
    const cases = readCases(project.cases);
    const model = sim.modelNow();
    const shot = { model, boxes: filmBoxes(parts, sim.worldParts) };
    const used = cases.filter((c) => drafts.some((d) => d.record.caseId === c.id));
    const hashes = new Map(await Promise.all(used.map(async (c) => [c.id, await contractHash(c)] as const)));
    const kept: string[] = [];

    try {
      for (const draft of drafts) {
        const kase = cases.find((c) => c.id === draft.record.caseId);
        const manifest = storedTry(draft.record, {
          sceneId,
          caseName: kase?.name ?? '',
          contractHash: hashes.get(draft.record.caseId) ?? '',
          joints: tryJoints(model),
          input: draft.input,
        });

        await keepTry(manifest, draft.recording, await filmOf(draft, shot));
        kept.push(draft.record.id);
      }
    } catch (err) {
      showToast(errorMessage(err), { tone: 'error' });
    } finally {
      if (kept.length) setProject((p) => ({ ...p, tries: [...(p.tries ?? []), ...kept.map((id) => ({ id }))] }));
    }
  };

  const drop = (goes: (t: TryRecord) => boolean) =>
    setProject((p) => {
      const gone = sceneTries(p.tries, storedTriesNow())
        .filter(goes)
        .map((t) => t.id);

      void deleteTries(gone);

      return { ...p, tries: withoutRefs(p.tries, new Set(gone)) };
    });

  const unlink = (ids: readonly string[]) => {
    const gone = new Set(ids);

    if ((project.tries ?? []).some((t) => gone.has(t.id)))
      setProject((p) => ({ ...p, tries: withoutRefs(p.tries, gone) }));
  };

  return { all: sceneTries(project.tries, stored), add, drop, unlink };
}

export type SceneTries = ReturnType<typeof useSceneTries>;
