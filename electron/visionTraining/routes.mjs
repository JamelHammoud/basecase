import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const VISION_TRAINING_CALLS = {
  'vision-training:start': (store, value) => store.start(value),
  'vision-training:status': (store, value) => store.status(value),
  'vision-training:stop': (store, value) => store.stop(value),
  'vision-training:artifact': (store, value) => store.artifact(value),
  'vision-training:save-run': (store, value) => store.saveRun(value),
  'vision-training:runs': (store, value) => store.runs(value),
};

export const registerVisionTrainingHandlers = (ipcMain, store) => registerCalls(ipcMain, VISION_TRAINING_CALLS, store);
export const visionTrainingPostRoutes = (store) => postRoutesOf(VISION_TRAINING_CALLS, store);
