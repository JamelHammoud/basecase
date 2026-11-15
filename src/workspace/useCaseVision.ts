import { useVisionScope } from '../cameras/visionScope';
import { liveSceneVision } from '../cameras/sceneVision';
import type { Plan } from '../routines/planTypes';
import { prepareRoutineVision } from './routineVision';
import type { StartupLease } from './startupLease';

export function useCaseVision(lease: StartupLease) {
  const vision = liveSceneVision(useVisionScope());
  const prepare = async (plan: Plan | null, ticket: number): Promise<string | null> => {
    if (!plan || !lease.current(ticket)) return null;

    const prepared = await prepareRoutineVision(plan, vision.availableVisionCameras(), {
      vision,
      current: () => lease.current(ticket),
    });

    if (!lease.retain(ticket, prepared.release)) return null;

    return prepared.errors[0]?.message ?? null;
  };

  return { prepare, release: () => lease.cancel() };
}
