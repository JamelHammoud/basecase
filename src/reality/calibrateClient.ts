import { workerClient } from '../utils/workerRpc';
import type { CalibrateRequest } from './calibrate';
import type { MountRequest, MountResult } from './mountSearch';
import type { ServoCalibration } from './types';

type CalibrateHandlers = {
  calibrate: (request: Omit<CalibrateRequest, 'mj'>) => Promise<{ result: ServoCalibration }>;
  mounts: (request: MountRequest) => Promise<{ result: MountResult[] }>;
};

const localHandlers = async (): Promise<CalibrateHandlers> => {
  const { calibrateServo } = await import('./calibrate');
  const { findMounts } = await import('./mountSearch');

  return {
    calibrate: async (request) => ({ result: await calibrateServo(request) }),
    mounts: async (request) => ({ result: findMounts(request) }),
  };
};

export interface Calibrator {
  calibrate: (request: Omit<CalibrateRequest, 'mj'>) => Promise<ServoCalibration>;
  mounts: (request: MountRequest) => Promise<MountResult[]>;
  dispose: () => void;
}

export function calibrator(): Calibrator {
  const client = workerClient<CalibrateHandlers>(
    () => new Worker(new URL('./calibrate.worker.ts', import.meta.url), { type: 'module' }),
    localHandlers,
  );

  return {
    calibrate: (request) => client.call('calibrate', request),
    mounts: (request) => client.call('mounts', request),
    dispose: () => client.dispose(),
  };
}
