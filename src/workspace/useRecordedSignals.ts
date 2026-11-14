import { useEffect, useEffectEvent, useState } from 'react';
import type { CaseConsole } from '../cases/console/format';
import {
  goalVerdicts,
  recordedBus,
  recordedTrack,
  type RecordedBus,
  type RecordedScene,
  type Verdict,
} from '../cases/console/recordedSignals';
import { workerJudge } from '../cases/goalJudge';
import type { ProbeWorld } from '../cases/probes';
import { caseProbeWorld } from '../cases/tries';
import type { SimModel } from '../sim/mjcfTypes';
import type { Rig, V3 } from '../utils/kinematics';
import type { TryTimeline } from './useTryTimeline';

interface RecordedInput {
  timeline: TryTimeline;
  model: SimModel | null;
  rig: Rig;
  caseConsole: CaseConsole;
  cameras: string[];
}

interface Held {
  key: string;
  bus: RecordedBus;
}

const bareWorld = (model: SimModel, rig: Rig): ProbeWorld => ({
  model,
  effector: null,
  basePart: [...(rig.robots[0]?.parts ?? [])].find((id) => !rig.ownerOf.has(id)) ?? null,
  basePoint: rig.robots[0]?.pivot ?? ([0, 0, 0] as V3),
  objectAt: new Map(),
});

type SceneInput = Pick<RecordedInput, 'timeline' | 'model' | 'rig'>;

export function timelineScene({ timeline, model, rig }: SceneInput, verdicts: Verdict[] = []): RecordedScene | null {
  const { recording, efforts, scene } = timeline;

  if (!recording || !efforts || !model) return null;

  return {
    model,
    recording,
    efforts: efforts.forces,
    world: scene ? caseProbeWorld(scene.scoring) : bareWorld(model, rig),
    trace: scene?.trace ?? null,
    probes: scene?.scoring.kase.task.probes.map((p) => p.signal) ?? [],
    trips: timeline.trips,
    verdicts,
  };
}

const consoleOf = ({ caseConsole, cameras }: RecordedInput) => ({
  inputs: caseConsole.input,
  signals: caseConsole.signals,
  cameras,
});

export function useRecordedSignals(input: RecordedInput): RecordedBus | null {
  const { timeline, model, caseConsole, cameras } = input;

  const [held, setHeld] = useState<Held | null>(null);
  const key = timeline.recording
    ? `${timeline.record?.id}:${model?.version}:${JSON.stringify([caseConsole.input, caseConsole.signals ?? [], cameras])}`
    : null;
  const stale = !!held && held.key !== key;

  if (stale) setHeld(null);

  const build = useEffectEvent((built: string, alive: () => boolean) => {
    const scene = timelineScene(input);

    if (!scene || !alive()) return;

    const shown = recordedBus(recordedTrack(scene, consoleOf(input)));
    const contract = timeline.scene?.scoring.kase.task.contract;

    setHeld({ key: built, bus: shown });

    if (!contract || !scene.trace) return;

    void goalVerdicts(workerJudge(contract), scene.trace).then((verdicts) => {
      if (!alive() || !verdicts.length) return;

      const judged = recordedBus(recordedTrack({ ...scene, verdicts }, consoleOf(input)));

      judged.seek(shown.frame());
      setHeld({ key: built, bus: judged });
    });
  });

  useEffect(() => {
    if (!key) return;

    let current = true;
    const soon = setTimeout(() => build(key, () => current), 0);

    return () => {
      current = false;
      clearTimeout(soon);
    };
  }, [key]);

  const bus = held && held.key === key ? held.bus : null;
  const frame = timeline.frame;

  useEffect(() => {
    bus?.seek(frame);
  }, [bus, frame]);

  return timeline.open ? bus : null;
}
