import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { timelineLanes } from '../cases/timelineLanes';
import type { TryRecord } from '../cases/tries';
import { loadManifests, loadRecording } from '../cases/tryStore';
import { useVisionScope } from '../cameras/visionScope';
import type { SeedReplay } from '../cases/seedReplay';
import type { Simulation } from '../sim/useSimulation';
import { useTimelinePlayback } from './useTimelinePlayback';
import { useTryLabels } from './useTryLabels';
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

export function useTryTimeline(options: TimelineOptions) {
  const { closeRecordedCameras, openRecordedCameras, seekRecordedCameras } = useVisionScope().playback;
  const { sim } = options;
  const [opened, setOpened] = useState<Opened | null>(null);
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

  const show = async (record: TryRecord, at?: number, seeded?: SeedReplay, current = () => true) => {
    const previous = pending.current?.current() ? pending.current.origin : opened;
    const ticket = ++opening.current;
    const valid = () => ticket === opening.current && current();
    const [recording, manifests] = await Promise.all([
      seeded?.recording ?? loadRecording(record.id),
      seeded ? Promise.resolve([]) : loadManifests([record.id]),
    ]);

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
