import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { loadRecordingBytes } from '../cases/tryStore';
import type { TryRecord, TryScoring } from '../cases/tries';
import type { TryBranch } from '../cases/tryBranch';
import type { Simulation } from '../sim/useSimulation';
import type { TryPhase } from './useCaseTry';
import { useStartupLease } from './useStartupLease';

export interface BranchTryInput {
  source: TryRecord;
  scoring: Omit<TryScoring, 'recording'>;
  frame: number;
  current: () => boolean;
  started: () => void;
}

export interface BranchTryContext extends BranchTryInput {
  provenance: TryBranch;
  ticket: number;
}

interface Options {
  sim: Simulation;
  scope: unknown;
  setPhase: (phase: TryPhase) => void;
  setStartedAt: (time: number) => void;
  onRefuse: (message: string) => void;
}

export const BRANCH_REFUSAL = 'Record a new scripted try with this Case and robot.';

export function useCaseBranch({ sim, scope, setPhase, setStartedAt, onRefuse }: Options) {
  const context = useRef<BranchTryContext | null>(null);
  const pending = useRef(false);
  const [held, setHeld] = useState<BranchTryContext | null>(null);
  const cancelSession = () => {
    if (!pending.current && !context.current) return;

    pending.current = false;
    context.current = null;
    sim.cancelBranch();
    sim.drive.stop();
    setHeld(null);
    setPhase('idle');
  };
  const lease = useStartupLease(scope, sim.subscribeStop, cancelSession, () => context.current !== null);
  const cancel = () => {
    lease.cancel();
    cancelSession();
  };
  const stopFromEffect = useEffectEvent(cancel);

  useEffect(() => {
    if (sim.status === 'off' || sim.status === 'error') stopFromEffect();
  }, [sim.status]);

  const reject = (result: unknown, current: () => boolean, ticket: number) => {
    pending.current = false;

    if (result) sim.cancelBranch();

    if (lease.current(ticket)) setPhase('idle');

    if (current()) onRefuse(BRANCH_REFUSAL);

    return false;
  };

  return {
    cancel,
    running: held !== null,
    seconds: held?.scoring.kase.task.seconds,
    context: () => context.current,
    valid: (held: BranchTryContext) => lease.current(held.ticket),
    clear: () => {
      lease.cancel();
      context.current = null;
      pending.current = false;
      setHeld(null);
    },
    start: async (input: BranchTryInput) => {
      if (pending.current || context.current || !input.current()) return false;

      const ticket = lease.claim();
      const current = () => lease.current(ticket) && input.current();

      pending.current = true;
      setPhase('starting');

      const bytes = await loadRecordingBytes(input.source.id).catch(() => null);

      if (!current() || !bytes) return reject(null, current, ticket);

      const result = await sim.branch(input.frame, input.scoring.kase, bytes);

      pending.current = false;

      if (!current() || !result) return reject(result, current, ticket);

      if (!sim.drive.resume(result.controller)) {
        sim.cancelBranch();
        setPhase('idle');
        onRefuse(BRANCH_REFUSAL);

        return false;
      }

      context.current = { ...input, provenance: result.branch, ticket };
      setStartedAt(result.deadline - input.scoring.kase.task.seconds);
      input.started();
      setHeld(context.current);
      setPhase('running');
      sim.play();

      return true;
    },
  };
}
