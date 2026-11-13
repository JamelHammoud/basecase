import { useEffect, useEffectEvent, useState } from 'react';
import { liveGoal } from '../cases/liveGoal';
import { boundEffector, robotFacts } from '../cases/robotFit';
import { scaledToReach } from '../cases/scale';
import { caseProbeReader } from '../cases/tries';
import type { Simulation } from '../sim/useSimulation';
import type { ScenePart } from '../types/robotics';
import type { Rig } from '../utils/kinematics';
import type { Cases } from './useCases';

const EVERY_MS = 500;

interface TryGoalInput {
  sim: Simulation;
  cases: Cases;
  rig: Rig;
  parts: ScenePart[];
}

export function useTryGoal({ sim, cases, rig, parts }: TryGoalInput): string[] {
  const [failed, setFailed] = useState<string[]>([]);
  const running = cases.attempt.phase === 'running';
  const kase = cases.active;
  const model = sim.model;

  const follow = useEffectEvent(() => {
    if (!kase || !model) return () => {};

    const facts = robotFacts(rig, parts);
    const scaled = scaledToReach(kase, facts.reachMm, facts.anchor);
    const effector = boundEffector(scaled.slot.binding, facts, rig);
    const goal = liveGoal(scaled.task.contract, caseProbeReader({ kase: scaled, model, effector, rig }));
    const stop = sim.subscribePoses((poses) => goal.add(sim.latestStats()?.time ?? 0, poses));
    let checking = false;

    const check = () => {
      if (checking) return;

      checking = true;
      void goal.failed().then((labels) => {
        checking = false;
        setFailed(labels);
      });
    };

    check();

    const timer = setInterval(check, EVERY_MS);

    return () => {
      stop();
      clearInterval(timer);
    };
  });

  useEffect(() => {
    if (!running) return;

    return follow();
  }, [running, kase, model]);

  return running ? failed : [];
}
