import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { RecordedSeed } from '../cases/caseCheckJob';
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
  record: TryRecord | null;
  seed: number | null;
  recording: Recording;
  efforts: Float32Array[];
  trips: Trip[];
  before: 'off' | 'paused' | 'playing';
}

interface Shown {
  record: TryRecord | null;
  seed: number | null;
  recording: Recording;
  trips?: Trip[];
}

async function tripsOf(options: TimelineOptions, recording: Recording): Promise<Trip[]> {
  const { sim, rig, parts, active, partners } = options;
  const model = sim.modelNow();

  if (!active || !model) return [];

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

type ShownParts = Pick<Shown, 'record' | 'seed'> & { recording: Recording | null; trips: Trip[] };

const NOTHING_SHOWN: ShownParts = { record: null, seed: null, recording: null, trips: [] };

const shownParts = (o: Opened | null): ShownParts =>
  o ? { record: o.record, seed: o.seed, recording: o.recording, trips: o.trips } : NOTHING_SHOWN;

export function useTryTimeline(options: TimelineOptions) {
  const { sim } = options;
  const [opened, setOpened] = useState<Opened | null>(null);
  const opening = useRef(0);
  const frames = opened?.recording.frames ?? 0;
  const playback = useTimelinePlayback({ frames, dt: opened?.recording.dt ?? 1, seek: sim.seek });
  const lanes = opened && sim.model ? timelineLanes(sim.model, opened.recording, opened.efforts) : [];

  const openRecording = async (shown: Shown, ticket: number) => {
    const { recording } = shown;
    const before = simBefore(sim);

    if (sim.drive.active) sim.drive.stop();

    if (!sim.modelNow()) await sim.start();

    const efforts = await sim.scrub(recording);

    if (!efforts || ticket !== opening.current) return;

    const trips = shown.trips ?? (await tripsOf(options, recording));

    if (ticket !== opening.current) return;

    setOpened({ record: shown.record, seed: shown.seed, recording, efforts, trips, before: opened?.before ?? before });
    playback.jump(trips[0]?.frame ?? 0, recording.frames);
  };

  const show = async (record: TryRecord) => {
    const ticket = ++opening.current;
    const recording = await loadRecording(record.id);

    if (recording && ticket === opening.current) await openRecording({ record, seed: null, recording }, ticket);
  };

  const showSeed = async (load: () => Promise<RecordedSeed | null>) => {
    const ticket = ++opening.current;
    const run = await load();

    if (run && ticket === opening.current) await openRecording({ record: null, ...run }, ticket);
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
    ...shownParts(opened),
    frames,
    dt: opened?.recording.dt ?? 0,
    lanes,
    frame: playback.frame,
    playing: playback.playing,
    show,
    showSeed,
    close,
    seek: (frame: number) => playback.jump(frame),
    step: playback.step,
    toggle: playback.toggle,
  };
}

export type TryTimeline = ReturnType<typeof useTryTimeline>;
