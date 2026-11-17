import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const ELECTRICAL_CALLS = {
  'electrical:validate': (store, value) => store.validate(value),
  'electrical:cancel': (store, value) => store.cancel(value),
};

export const registerElectricalHandlers = (ipcMain, store) => registerCalls(ipcMain, ELECTRICAL_CALLS, store);
export const electricalPostRoutes = (store) => postRoutesOf(ELECTRICAL_CALLS, store);
