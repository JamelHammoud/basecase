import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { stageCase, stagedEffectors } from '../cases/caseCast';
import type { Case } from '../cases/schema';
import type { SlotRobot } from '../cases/slots';
import { timelineLanes } from '../cases/timelineLanes';
import { trySignals, type TryRecord } from '../cases/tries';
import { tripFrames, type Trip } from '../cases/tripFrames';
import { loadRecording } from '../cases/tryStore';
import type { Recording } from '../sim/recorder';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import { useTimelinePlayback } from './useTimelinePlayback';

interface TimelineOptions {
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  active: Case | null;
  partners: () => SlotRobot[];
}

interface Opened {
  record: TryRecord;
  recording: Recording;
  efforts: Float32Array[];
  trips: Trip[];
  before: 'off' | 'paused' | 'playing';
}

async function tripsOf(options: TimelineOptions, record: TryRecord, recording: Recording): Promise<Trip[]> {
  const { sim, rig, parts, active, partners } = options;
  const model = sim.modelNow();

  if (active?.id !== record.caseId || !model) return [];

  const staged = stageCase(active, { rig, parts }, partners());
  const scoring = { kase: staged.kase, model, recording, rig, ...stagedEffectors(staged, { rig, parts }) };

  return tripFrames(staged.kase.task.contract, trySignals(scoring)).catch(() => []);
}

function simBefore(sim: Simulation): Opened['before'] {
  if (sim.status === 'off') return 'off';

  return sim.playing ? 'playing' : 'paused';
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

export function useTryTimeline(options: TimelineOptions) {
  const { sim } = options;
  const [opened, setOpened] = useState<Opened | null>(null);
  const opening = useRef(0);
  const frames = opened?.recording.frames ?? 0;
  const playback = useTimelinePlayback({ frames, dt: opened?.recording.dt ?? 1, seek: sim.seek });
  const lanes = opened && sim.model ? timelineLanes(sim.model, opened.recording, opened.efforts) : [];

  const show = async (record: TryRecord, at?: number) => {
    const ticket = ++opening.current;
    const recording = await loadRecording(record.id);
    const before = simBefore(sim);

    if (!recording || ticket !== opening.current) return;

    if (sim.drive.active) sim.drive.stop();

    if (!sim.modelNow()) await sim.start();

    const efforts = await sim.scrub(recording);

    if (!efforts || ticket !== opening.current) return;

    const trips = await tripsOf(options, record, recording);

    if (ticket !== opening.current) return;

    setOpened({ record, recording, efforts, trips, before: opened?.before ?? before });
    playback.jump(at === undefined ? (trips[0]?.frame ?? 0) : at / recording.dt, recording.frames);
  };

  const close = () => {
    if (!opened) return;

    opening.current++;
    playback.stop();
    setOpened(null);
    void sim.scrub(null);

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
    open: !!opened,
    record: opened?.record ?? null,
    recording: opened?.recording ?? null,
    frames,
    dt: opened?.recording.dt ?? 0,
    lanes,
    trips: opened?.trips ?? [],
    frame: playback.frame,
    playing: playback.playing,
    show,
    close,
    seek: (frame: number) => playback.jump(frame),
    step: playback.step,
    toggle: playback.toggle,
  };
}

export type TryTimeline = ReturnType<typeof useTryTimeline>;
