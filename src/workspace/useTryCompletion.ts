import { useEffect, useEffectEvent } from 'react';
import type { Simulation } from '../sim/useSimulation';
import type { TryPhase } from './useCaseTry';

export function useFinishTry(input: {
  sim: Simulation;
  phase: TryPhase;
  recordId: () => number | undefined;
  seconds: number | undefined;
  elapsed: number;
  finish: () => Promise<void>;
}) {
  const finishFromEffect = useEffectEvent(() => {
    if (input.phase === 'running') void input.finish();
  });
  const finishStopped = useEffectEvent(() => {
    if (input.recordId() !== undefined) void input.finish();
  });
  const completed = useEffectEvent((id: number) => {
    if (input.recordId() === id) void input.finish();
  });
  const subscribeEnd = input.sim.teaching?.subscribeEnd;

  useEffect(() => subscribeEnd?.(completed), [subscribeEnd]);

  const subscribeStop = input.sim.subscribeStop;

  useEffect(() => {
    const detach = subscribeStop(finishStopped);

    return () => {
      detach();
      finishStopped();
    };
  }, [subscribeStop]);

  const running = input.phase === 'running';
  const outOfTime = running && input.seconds !== undefined && input.elapsed >= input.seconds;
  const leftDrive = running && !input.sim.drive.active;

  useEffect(() => {
    if (!outOfTime && !leftDrive) return;

    const soon = setTimeout(finishFromEffect, 0);

    return () => clearTimeout(soon);
  }, [outOfTime, leftDrive]);
}
