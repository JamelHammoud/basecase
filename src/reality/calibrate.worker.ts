/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { calibrateServo, loadedMujoco, type CalibrateRequest } from './calibrate';
import { replayTrace, type ReplayRequest } from './replayTrace';

serve({
  calibrate: async (request: Omit<CalibrateRequest, 'mj'>) => reply(await calibrateServo(request)),
  replay: async (request: ReplayRequest) => reply(replayTrace(await loadedMujoco(), request)),
});
