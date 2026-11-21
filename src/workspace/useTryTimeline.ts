import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { timelineLanes } from '../cases/timelineLanes';
import type { TryRecord } from '../cases/tries';
import { timelineSourceCurrent, readTimelineSource, type TimelineSource } from './tryTimelineSource';
import type { SeedReplay } from '../cases/seedReplay';
import { useVisionScope } from '../cameras/visionScope';
import type { Simulation } from '../sim/useSimulation';
import { useTimelinePlayback } from './useTimelinePlayback';
import { useTryLabels } from './useTryLabels';
import { useSavedTimeline } from './useSavedTimeline';
import { loadManifests } from '../cases/tryStore';
import {
  prepareOpening,
  restoreSeedWorld,
  timelineOrigin,
  type Opened,
  type TimelineOptions,
  type TimelineOrigin,
} from './tryTimelineOpening';

export type { TryScene } from './tryTimelineOpening';

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

async function isTopicTry(record: TryRecord) {
  if (record.manifest.modelHash) return false;

  const stored = (await loadManifests([record.id]))[0];

  return stored?.source === 'import' && stored.robot.joints.length === 0;
}

function comparisonAllowed(opened: Opened | null, sim: Simulation) {
  return !opened && !sim.drive.active;
}

export function useTryTimeline(options: TimelineOptions) {
  const { closeRecordedCameras, openRecordedCameras, seekRecordedCameras } = useVisionScope().playback;
  const { sim } = options;
  const [opened, setOpened] = useState<Opened | null>(null);
  const saved = useSavedTimeline();
  const opening = useRef(0);
  const pending = useRef<{ origin: TimelineOrigin; current: () => boolean } | null>(null);
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

  useEffect(() => {
    if (opened) seekRecordedCameras(playback.frame * opened.recording.dt, !playback.playing);
  }, [opened, playback.frame, playback.playing, seekRecordedCameras]);

  useEffect(() => () => closeRecordedCameras(), [closeRecordedCameras]);

  const show = async (record: TryRecord, at?: number, seeded?: SeedReplay, source: TimelineSource = () => true) => {
    const current = timelineSourceCurrent(source);
    const previous = pending.current?.current() ? pending.current.origin : opened;
    const ticket = ++opening.current;
    const valid = () => ticket === opening.current && current();

    saved.close();

    const topicOnly = await isTopicTry(record);

    if (!valid()) return false;

    if (topicOnly) return saved.show([record.id], at);

    const [recording, manifests] = await readTimelineSource(record.id, seeded, source);

    if (!recording || !valid()) return false;

    const origin = timelineOrigin(sim, seeded, previous);

    pending.current = { origin, current: valid };

    const prepared = await prepareOpening(options, record, recording, { seeded, previous: origin, current: valid });

    if (!prepared || !valid()) return false;

    openRecordedCameras(manifests[0] ?? null);
    setOpened(prepared);
    playback.reset(at ?? prepared.trips[0]?.frame ?? 0, recording.frames);

    return true;
  };

  const close = () => {
    opening.current++;
    pending.current = null;

    if (!opened) return;

    playback.stop();
    closeRecordedCameras();
    setOpened(null);
    void sim.scrub(null);

    if (opened.restore) return restoreSeedWorld(sim, opened);

    if (opened.before === 'off') sim.stop();
    else sim.reset();

    if (opened.before === 'playing') sim.play();
  };

  useSimGone(opened, sim, () => {
    opening.current++;
    pending.current = null;
    playback.stop();
    closeRecordedCameras();
    setOpened(null);
  });

  const controls = saved.active ? saved : { ...playback, frames, dt: opened?.recording.dt ?? 0, origin: 0, close };

  return {
    ...openedView(opened),
    open: !!opened || saved.active,
    comparison: saved,
    canCompare: comparisonAllowed(opened, sim),
    compare: (ids: readonly string[]) => {
      if (!comparisonAllowed(opened, sim)) return Promise.resolve(false);

      opening.current++;

      return saved.show(ids);
    },
    frames: controls.frames,
    origin: controls.origin,
    dt: controls.dt,
    lanes,
    labels,
    frame: controls.frame,
    playing: controls.playing,
    speed: controls.speed,
    loop: controls.loop,
    show,
    close: controls.close,
    seek: controls.jump,
    step: controls.step,
    toggle: controls.toggle,
    faster: controls.faster,
    setLoop: controls.setLoop,
  };
}

export type TryTimeline = ReturnType<typeof useTryTimeline>;
