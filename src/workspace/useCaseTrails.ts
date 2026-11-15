import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import type { Case } from '../cases/schema';
import { tryManifest, type TryRecord } from '../cases/tries';
import type { SeedReplay } from '../cases/seedReplay';
import type { Viewport3DHandle } from '../components/Viewport3D';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { ShowToast } from './types';
import { errorMessage } from '../utils/errorMessage';
import { caseVerdict, type CaseRobotInput } from './caseChecks';
import type { TryTimeline } from './useTryTimeline';

interface TrailOptions {
  active: Case | null;
  parts: ScenePart[];
  project: ProjectSettings;
  viewportRef: RefObject<Viewport3DHandle | null>;
  caseRobot: () => Promise<CaseRobotInput | null>;
  timeline: TryTimeline;
  showToast: ShowToast;
  open: (id: string | null) => void;
}

async function replayRecord(replay: SeedReplay): Promise<TryRecord> {
  const manifest = await tryManifest(replay.kase, replay.model, replay.recording);

  return {
    id: crypto.randomUUID(),
    caseId: replay.kase.id,
    robot: replay.kase.name,
    at: new Date().toISOString(),
    passed: replay.passed,
    margin: replay.margin,
    seconds: replay.recording.frames * replay.recording.dt,
    manifest: { ...manifest, seed: replay.seed },
  };
}

export function useCaseTrails(options: TrailOptions) {
  const { active, parts, project, viewportRef } = options;
  const [selected, setSelected] = useState<string | null>(null);
  const readRobot = useEffectEvent(options.caseRobot);
  const onError = useEffectEvent((message: string) => options.showToast(message, { tone: 'error' }));
  const show = useEffectEvent(async (replay: SeedReplay, current: () => boolean) => {
    const record = await replayRecord(replay);

    if (current()) await options.timeline.show(record, replay.trips[0]?.frame ?? 0, replay, current);
  });
  const readCase = useEffectEvent(() => options.active);
  const id = active?.id;

  useEffect(() => {
    const viewport = viewportRef.current;
    let live = true;
    let opening = 0;

    viewport?.setCaseTrails([], () => {});

    if (!selected || selected !== id) return;

    const load = async () => {
      const kase = readCase();
      const input = await readRobot();

      if (!live || !kase || !input) return;

      const verdict = await caseVerdict(input, kase);

      if (!live) return;

      viewport?.setCaseTrails(verdict.runs.outcomes, (seed) => {
        const ticket = ++opening;
        const current = () => live && ticket === opening;

        void verdict
          .record(seed)
          .then(async (replay) => {
            if (current()) await show(replay, current);
          })
          .catch((e: unknown) => {
            if (live) onError(errorMessage(e));
          });
      });
    };

    void load().catch((e: unknown) => {
      if (live) onError(errorMessage(e));
    });

    return () => {
      live = false;
      viewport?.setCaseTrails([], () => {});
    };
  }, [selected, id, parts, project.joints, project.cases, project.skills, viewportRef]);

  return {
    select: setSelected,
    openCheck: (id: string) => {
      options.open(id);
      setSelected(id);
    },
  };
}
