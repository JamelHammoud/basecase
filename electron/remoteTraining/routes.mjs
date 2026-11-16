import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const REMOTE_TRAINING_CALLS = {
  'remote-training:status': (training) => training.status(),
  'remote-training:configure': (training, config) => training.configure(config),
  'remote-training:clear': (training) => training.clear(),
};

export const registerRemoteTrainingHandlers = (ipcMain, training) =>
  registerCalls(ipcMain, REMOTE_TRAINING_CALLS, training);
export const remoteTrainingPostRoutes = (training) => postRoutesOf(REMOTE_TRAINING_CALLS, training);
