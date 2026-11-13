import { useEffect, useEffectEvent, useRef } from 'react';
import type { Controller } from '../sim/engine';
import type { PolicySpec } from '../sim/policy';
import type { Simulation } from '../sim/useSimulation';
import type { WatchPlan } from '../skills/liveWatch';
import type { SnapshotRef } from '../skills/snapshots';

export interface WatchSubject {
  key: string;
  snapshot: SnapshotRef | null;
  robot: string | null;
  plan: () => WatchPlan;
  load: (ref: SnapshotRef) => Promise<PolicySpec | null>;
}

interface Session {
  key: string;
  previous: Controller | null;
  started: boolean;
}

export function useTrainingWatch(sim: Simulation, subject: WatchSubject | null): number | null {
  const session = useRef<Session | null>(null);
  const key = subject?.key ?? null;
  const run = subject?.snapshot?.run ?? null;
  const iteration = subject?.snapshot?.iteration ?? null;

  const end = useEffectEvent(() => {
    const ended = session.current;

    session.current = null;

    if (!ended?.previous) return;

    sim.watch(null);

    if (ended.started) {
      sim.stop();

      return;
    }

    sim.setController(ended.previous);
    sim.reset();
  });

  const show = useEffectEvent(async (isLive: () => boolean) => {
    const ref = subject?.snapshot;
    const policy = ref ? await subject.load(ref) : null;
    const current = session.current;

    if (!policy || !current || !isLive()) return;

    if (!current.previous) {
      current.previous = sim.controller;
      current.started = sim.status === 'off';
    }

    if (sim.status === 'off') await sim.start();

    if (!isLive()) return;

    const plan = subject!.plan();

    sim.setController({ kind: 'policy', policy, robot: plan.check?.robot ?? subject!.robot ?? '' });
    sim.watch(plan);
  });

  useEffect(() => {
    if (!key) return;

    session.current = { key, previous: null, started: false };

    return () => end();
  }, [key]);

  useEffect(() => {
    if (!key || run === null || iteration === null) return;

    let live = true;

    void show(() => live);

    return () => {
      live = false;
    };
  }, [key, run, iteration]);

  return key ? sim.watchMargin : null;
}
