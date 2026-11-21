import type { SeedReplay } from '../cases/seedReplay';
import type { TimelineSource } from './tryTimelineSource';
import { showTimeline } from './tryTimelineShow';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { timelineLanes } from '../cases/timelineLanes';
import type { TryRecord } from '../cases/tries';
import { useVisionScope } from '../cameras/visionScope';
import type { Simulation } from '../sim/useSimulation';
import { useTimelinePlayback } from './useTimelinePlayback';
import { useTryLabels } from './useTryLabels';
import { useSavedTimeline } from './useSavedTimeline';
import { restoreSeedWorld, type Opened, type TimelineOptions, type TimelineOrigin } from './tryTimelineOpening';

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

function comparisonAllowed(opened: Opened | null, sim: Simulation) {
  return !opened && !sim.drive.active;
}

export function useTryTimeline(options: TimelineOptions) {
  const { closeRecordedCameras, openRecordedCameras, seekRecordedCameras } = useVisionScope().playback;
  const { sim } = options;
  const [opened, setOpened] = useState<Opened | null>(null);
  const saved = useSavedTimeline();
  const opening = useRef(0);
  const movement = useRef(0);
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

  const show = (record: TryRecord, at?: number, seeded?: SeedReplay, source?: TimelineSource) =>
    showTimeline(
      { options, opened, opening, pending, saved, setOpened, reset: playback.reset, openRecordedCameras },
      { record, at, seeded, source },
    );

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
    branchSource: () => {
      if (!opened?.scene) return null;

      const ticket = opening.current;
      const at = movement.current;

      return {
        source: opened.record,
        scoring: opened.scene.scoring,
        frame: controls.frame,
        current: () => ticket === opening.current && at === movement.current && !!pending.current?.current(),
        started: () => {
          opening.current++;
          pending.current = null;
          playback.stop();
          closeRecordedCameras();
          setOpened(null);
        },
      };
    },
    close: controls.close,
    seek: (frame: number) => {
      movement.current++;
      controls.jump(frame);
    },
    step: (direction: number) => {
      movement.current++;
      controls.step(direction);
    },
    toggle: controls.toggle,
    faster: controls.faster,
    setLoop: controls.setLoop,
  };
}

export type TryTimeline = ReturnType<typeof useTryTimeline>;
