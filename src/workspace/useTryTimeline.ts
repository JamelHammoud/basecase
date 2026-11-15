import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { caseWorldItems } from '../cases/importedWorldItems';
import type { SimModel } from '../sim/mjcfTypes';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { timelineLanes } from '../cases/timelineLanes';
import { trySignals, type TryRecord, type TryScoring } from '../cases/tries';
import { tripFrames, type Trip } from '../cases/tripFrames';
import { loadRecording } from '../cases/tryStore';
import type { RecordedEfforts } from '../sim/recordedFrames';
import type { SeedReplay } from '../cases/seedReplay';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import { withoutTopics } from '../topics/recordingTopics';
import type { Trace } from '../skills/contract';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { useTimelinePlayback } from './useTimelinePlayback';
import { useTryLabels } from './useTryLabels';

interface TimelineOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  cases: Case[];
  partners: () => SlotRobot[];
}

export interface TryScene {
  kase: Case;
  scoring: Omit<TryScoring, 'recording'>;
  trace: Trace;
}

interface Opened {
  record: TryRecord;
  recording: Recording;
  efforts: RecordedEfforts;
  trips: Trip[];
  scene: TryScene | null;
  before: 'off' | 'paused' | 'playing';
  restore?: () => void;
}

function sceneOf(options: TimelineOptions, record: TryRecord, recording: Recording): TryScene | null {
  const { sim, rig, parts, cases, partners } = options;
  const model = sim.modelNow();
  const kase = cases.find((c) => c.id === record.caseId);

  if (!kase || !model) return null;

  const staged = stageCase(kase, { rig, parts }, partners());
  const scoring = { kase: staged.kase, model, rig, ...stagedEffectors(staged, { rig, parts }) };

  return { kase, scoring, trace: trySignals({ ...scoring, recording }) };
}

const tripsOf = (scene: TryScene | null): Promise<Trip[]> =>
  scene ? tripFrames(scene.scoring.kase.task.contract, scene.trace).catch(() => []) : Promise.resolve([]);

function simBefore(sim: Simulation): Opened['before'] {
  if (sim.status === 'off') return 'off';

  return sim.playing ? 'playing' : 'paused';
}

function restoreSeedWorld(sim: Simulation, model: SimModel | null, before: Opened['before']) {
  const world = sim.worldParts;

  return () => {
    sim.setWorld(world);

    if (before === 'off') return;

    void sim.start(model ?? undefined).then(() => {
      if (before === 'paused') sim.pause();
    });
  };
}

function openingFrame(at: number | undefined, trips: Trip[]): number {
  return at ?? trips[0]?.frame ?? 0;
}

async function prepareOpening(
  options: TimelineOptions,
  record: TryRecord,
  recording: Recording,
  seeded?: SeedReplay,
): Promise<Opened | null> {
  const { sim } = options;
  const before = simBefore(sim);
  const restore = seeded ? restoreSeedWorld(sim, sim.modelNow(), before) : undefined;

  if (sim.drive.active) sim.drive.stop();

  if (seeded) sim.setWorld(caseWorldItems(seeded.kase));

  if (seeded || !sim.modelNow()) await sim.start(seeded?.model);

  const efforts = await sim.scrub(withoutTopics(recording));

  if (!efforts) return null;

  const staged = sceneOf(options, record, recording);
  const scene =
    seeded && staged
      ? {
          kase: staged.kase,
          scoring: { ...staged.scoring, kase: seeded.kase, model: seeded.model },
          trace: seeded.trace,
        }
      : staged;
  const trips = seeded?.trips ?? (await tripsOf(scene));

  return { record, recording, efforts, trips, scene, before, restore };
}

function useSimGone(opened: Opened | null, sim: Simulation, drop: () => void) {
  const gone = !!opened && sim.status === 'off';
  const dropFromEffect = useEffectEvent(drop);

  useEffect(() => {
    if (!gone) return;

    const soon = setTimeout(dropFromEffect, 0);

    return () => clearTimeout(soon);
  }, [gone]);
}

const openedView = (opened: Opened | null) => ({
  open: !!opened,
  record: opened?.record ?? null,
  recording: opened?.recording ?? null,
  efforts: opened?.efforts ?? null,
  scene: opened?.scene ?? null,
  trips: opened?.trips ?? [],
});

export function useTryTimeline(options: TimelineOptions) {
  const { sim } = options;
  const [opened, setOpened] = useState<Opened | null>(null);
  const opening = useRef(0);
  const frames = opened?.recording.frames ?? 0;
  const playback = useTimelinePlayback({ frames, dt: opened?.recording.dt ?? 1, seek: sim.seek });
  const lanes = opened && sim.model ? timelineLanes(sim.model, opened.recording, opened.efforts.peaks) : [];
  const labels = useTryLabels({
    id: opened?.record.id ?? null,
    recording: opened?.recording ?? null,
    scene: () => ({
      model: sim.modelNow(),
      rig: options.rig,
      parts: options.parts,
      cases: options.cases,
      partners: options.partners,
    }),
  });

  const show = async (record: TryRecord, at?: number, seeded?: SeedReplay) => {
    const ticket = ++opening.current;
    const recording = seeded?.recording ?? (await loadRecording(record.id));

    if (!recording || ticket !== opening.current) return false;

    const prepared = await prepareOpening(options, record, recording, seeded);

    if (!prepared || ticket !== opening.current) return false;

    setOpened({ ...prepared, before: opened?.before ?? prepared.before, restore: opened?.restore ?? prepared.restore });
    playback.reset(openingFrame(at, prepared.trips), recording.frames);

    return true;
  };

  const close = () => {
    if (!opened) return;

    opening.current++;
    playback.stop();
    setOpened(null);
    void sim.scrub(null);

    if (opened.restore) return opened.restore();

    if (opened.before === 'off') sim.stop();
    else sim.reset();

    if (opened.before === 'playing') sim.play();
  };

  useSimGone(opened, sim, () => {
    opening.current++;
    playback.stop();
    setOpened(null);
  });

  return {
    ...openedView(opened),
    frames,
    dt: opened?.recording.dt ?? 0,
    lanes,
    labels,
    frame: playback.frame,
    playing: playback.playing,
    speed: playback.speed,
    loop: playback.loop,
    show,
    close,
    seek: (frame: number) => playback.jump(frame),
    step: playback.step,
    toggle: playback.toggle,
    faster: playback.faster,
    setLoop: playback.setLoop,
  };
}

export type TryTimeline = ReturnType<typeof useTryTimeline>;
