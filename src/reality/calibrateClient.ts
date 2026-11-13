import { workerClient } from '../utils/workerRpc';
import type { CalibrateRequest } from './calibrate';
import type { ServoCalibration } from './types';

type CalibrateHandlers = {
  calibrate: (request: Omit<CalibrateRequest, 'mj'>) => Promise<{ result: ServoCalibration }>;
};

const localHandlers = async (): Promise<CalibrateHandlers> => {
  const { calibrateServo } = await import('./calibrate');

  return { calibrate: async (request) => ({ result: await calibrateServo(request) }) };
};

export interface Calibrator {
  calibrate: (request: Omit<CalibrateRequest, 'mj'>) => Promise<ServoCalibration>;
  dispose: () => void;
}

export function calibrator(): Calibrator {
  const client = workerClient<CalibrateHandlers>(
    () => new Worker(new URL('./calibrate.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  );

  return { calibrate: (request) => client.call('calibrate', request), dispose: () => client.dispose() };
}
