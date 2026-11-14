import { postRoutesOf, registerCalls } from '../callRoutes.mjs';
import { FRAME_SET_CALLS } from './frameSetRoutes.mjs';

export const DATASET_CALLS = {
  ...FRAME_SET_CALLS,
  'datasets:list': (store) => store.list(),
  'datasets:save': (store, dataset) => store.save(dataset),
  'datasets:delete': (store, ids) => store.delete(ids),
};

export const registerDatasetHandlers = (ipcMain, store) => registerCalls(ipcMain, DATASET_CALLS, store);

export const datasetPostRoutes = (store) => postRoutesOf(DATASET_CALLS, store);
