/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { replayVersion, type ReplayRequest } from './benchReplay';
import { calibrateServo, loadedMujoco, type CalibrateRequest } from './calibrate';

serve({
  calibrate: async (request: Omit<CalibrateRequest, 'mj'>) => reply(await calibrateServo(request)),
  replay: async (request: ReplayRequest) => reply(replayVersion(await loadedMujoco(), request)),
});
