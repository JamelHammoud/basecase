import { useState, type RefObject } from 'react';
import type { ActionOwner } from '../sim/teaching';
import type { Simulation } from '../sim/useSimulation';
import type { TryPhase } from './useCaseTry';
import { errorMessage } from '../utils/errorMessage';

export function useCaseHandoff(input: {
  sim: Simulation;
  phase: TryPhase;
  finishing: RefObject<boolean>;
  onRefuse: (message: string) => void;
  setPhase: (phase: TryPhase) => void;
}) {
  const [owner, setOwner] = useState<ActionOwner | null>(null);
  const handoff = async () => {
    if (!owner || input.phase !== 'running' || input.finishing.current) return;

    const reply = await input.sim.teaching.handoff(owner === 'policy' ? 'operator' : 'policy');

    if (reply.problem) return input.onRefuse(reply.problem);

    setOwner((previous) => (previous === owner ? reply.owner : previous));
  };

  const fail = (error: unknown) => {
    input.onRefuse(errorMessage(error));
    input.sim.drive.stop();
    setOwner(null);
    input.setPhase('idle');
  };

  return { owner, setOwner, handoff, fail };
}
