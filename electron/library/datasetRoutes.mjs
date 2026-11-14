import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const DATASET_CALLS = {
  'datasets:list': (store) => store.list(),
  'datasets:save': (store, dataset) => store.save(dataset),
  'datasets:delete': (store, ids) => store.delete(ids),
};

export const registerDatasetHandlers = (ipcMain, store) => registerCalls(ipcMain, DATASET_CALLS, store);

export const datasetPostRoutes = (store) => postRoutesOf(DATASET_CALLS, store);
