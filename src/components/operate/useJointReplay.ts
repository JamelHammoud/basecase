import { useEffect, useState } from 'react';
import { loggedTrace, type VersionReplay } from '../../reality/benchReplay';
import type { CalibrationHistory } from '../../reality/history';
import { replayedVersion, replayOf } from '../../reality/replayClient';
import type { ReplayLog, ServoCalibration } from '../../reality/types';

interface Replayed {
  logs: ReplayLog[] | undefined;
  chosen: ServoCalibration | null;
  preset: VersionReplay;
  calibrated: VersionReplay | null;
}

export function useJointReplay(history: CalibrationHistory, version: number | null) {
  const chosen = replayedVersion(history, version);
  const [replayed, setReplayed] = useState<Replayed | null>(null);

  useEffect(() => {
    let live = true;

    Promise.all([replayOf(history, null), chosen ? replayOf(history, chosen) : null])
      .then(([preset, calibrated]) => {
        if (live) setReplayed({ logs: history.logs, chosen, preset, calibrated });
      })
      .catch(() => {
        if (live) setReplayed(null);
      });

    return () => {
      live = false;
    };
  }, [history, chosen]);

  const current = replayed && replayed.logs === history.logs && replayed.chosen === chosen ? replayed : null;

  return {
    chosen,
    logged: loggedTrace(history.logs ?? []),
    preset: current?.preset ?? null,
    calibrated: current?.calibrated ?? null,
  };
}
