import type { HandoffStub } from '../../handoffStub';
import type { Studio } from '../types';

export default function routinesStudio(studio: Studio) {
  const routines = () => studio().core.simTraining.routines;

  return {
    routineState: () => routines().state(),
    stubHandoffs: (stub: HandoffStub) => routines().handoffs.stub(stub),
    plantHandoff: (from: string, to: string, falls: number) => routines().handoffs.plant({ from, to }, falls),
  };
}
