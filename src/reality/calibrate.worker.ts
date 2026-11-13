/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { calibrateServo, type CalibrateRequest } from './calibrate';

serve({
  calibrate: async (request: Omit<CalibrateRequest, 'mj'>) => reply(await calibrateServo(request)),
});
