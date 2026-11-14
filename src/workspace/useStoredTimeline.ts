import { useEffect, useState } from 'react';
import { timelineLanes } from '../cases/timelineLanes';
import { openTry, type OpenedTry } from '../cases/tryStore';
import type { Recording } from '../sim/recorder';
import { prettyJointName } from '../utils/kinematics';
import { useTimelinePlayback } from './useTimelinePlayback';
import type { TimelineView } from './useTryTimeline';

interface Loaded extends OpenedTry {
  recording: Recording;
}

const still = () => undefined;

export function useStoredTimeline(id: string | null, onClose: () => void) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded && loaded.record.id === id ? loaded : null;
  const recording = current?.recording;
  const frames = recording?.frames ?? 0;
  const playback = useTimelinePlayback({ frames, dt: recording?.dt ?? 1, seek: still });
  const joints = current?.record.robot.joints ?? [];

  useEffect(() => {
    if (!id) return;

    let live = true;

    void openTry(id).then((opened) => {
      if (live && opened?.recording) setLoaded({ record: opened.record, recording: opened.recording });
    });

    return () => {
      live = false;
    };
  }, [id]);

  const view: TimelineView = {
    open: !!current,
    frames,
    dt: recording?.dt ?? 0,
    lanes: recording ? timelineLanes(joints, recording, null) : [],
    trips: [],
    frame: playback.frame,
    playing: playback.playing,
    close: onClose,
    seek: (frame: number) => playback.jump(frame),
    step: playback.step,
    toggle: playback.toggle,
  };

  return {
    view,
    nameOf: (jointId: string) => prettyJointName(joints.find((j) => j.id === jointId)?.name ?? jointId),
  };
}
