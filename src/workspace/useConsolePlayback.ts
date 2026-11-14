import { useEffect, useEffectEvent } from 'react';
import { consoleTrack } from '../cases/console/consoleTrack';
import type { CaseConsole } from '../cases/console/format';
import type { SignalBus } from '../cases/console/signalBus';
import { workerJudge } from '../cases/goalJudge';
import type { Case } from '../cases/schema';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { TryTimeline } from './useTryTimeline';

interface ConsolePlaybackInput {
  open: boolean;
  bus: SignalBus;
  timeline: TryTimeline;
  kase: Case | null;
  caseConsole: CaseConsole;
  sim: Simulation;
  rig: Rig;
  parts: ScenePart[];
  cameras: string[];
}

export function useConsolePlayback(input: ConsolePlaybackInput) {
  const { open, bus, timeline } = input;
  const recording = open ? timeline.recording : null;
  const model = input.sim.model;

  const build = useEffectEvent(() =>
    consoleTrack({
      kase: input.kase,
      model: model!,
      rig: input.rig,
      parts: input.parts,
      recording: recording!,
      efforts: timeline.efforts,
      caseConsole: input.caseConsole,
      cameras: input.cameras,
      judge: workerJudge,
    }).catch(() => null),
  );
  const playhead = useEffectEvent(() => timeline.frame);

  useEffect(() => {
    if (!recording || !model) return;

    let current = true;

    void build().then((track) => {
      if (!current || !track) return;

      bus.play(track);
      bus.seek(playhead());
    });

    return () => {
      current = false;
      bus.play(null);
    };
  }, [bus, recording, model]);

  const { frame } = timeline;

  useEffect(() => {
    bus.seek(frame);
  }, [bus, frame]);

  return recording ? timeline.seek : null;
}
