import type { SimModel } from '../sim/mjcfTypes';
import type { RobotRun } from '../robot/runBuffer';
import { workerClient } from '../utils/workerRpc';
import type { BodyCalibration } from './bodyTypes';

export interface BodyFitRequest {
  model: SimModel;
  run: RobotRun;
  robot: string;
}

type BodyHandlers = {
  fit: (request: BodyFitRequest) => Promise<{ result: BodyCalibration }>;
};

export function bodyClient() {
  const client = workerClient<BodyHandlers>(
    () => new Worker(new URL('./body.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      if (typeof window !== 'undefined') throw new Error('Reload the app before fitting its body.');

      const { fitBody } = await import('./fitBody');

      return { fit: async (request) => ({ result: await fitBody(request) }) };
    },
  );

  return {
    fit: (request: BodyFitRequest) => client.call('fit', request),
    dispose: client.dispose,
  };
}
