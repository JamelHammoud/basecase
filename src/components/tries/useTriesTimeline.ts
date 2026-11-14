import { useEffect, useState } from 'react';
import type { StoredTry } from '../../cases/storedTry';
import { timelineLanes } from '../../cases/timelineLanes';
import { loadRecording } from '../../cases/tryStore';
import type { Recording } from '../../sim/recorder';
import { prettyJointName } from '../../utils/kinematics';
import { useTimelinePlayback } from '../../workspace/useTimelinePlayback';

const noSeek = () => {};

export function useTriesTimeline(stored: StoredTry) {
  const [recording, setRecording] = useState<Recording | null>(null);

  useEffect(() => {
    let live = true;

    void loadRecording(stored.id).then((loaded) => {
      if (live) setRecording(loaded);
    });

    return () => {
      live = false;
    };
  }, [stored.id]);

  const frames = recording?.frames ?? 0;
  const playback = useTimelinePlayback({ frames, dt: recording?.dt ?? 1, seek: noSeek });
  const names = new Map(stored.robot.joints.map((j) => [j.id, prettyJointName(j.name)]));
  const rows = recording
    ? timelineLanes(stored.robot.joints, recording, null).map((lane) => ({
        lane,
        name: names.get(lane.jointId) ?? lane.jointId,
      }))
    : [];

  return {
    open: rows.length > 0,
    rows,
    frames,
    dt: recording?.dt ?? 0,
    frame: playback.frame,
    playing: playback.playing,
    seek: (frame: number) => playback.jump(frame),
    step: playback.step,
    toggle: playback.toggle,
  };
}
