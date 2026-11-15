import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const ROBOFLOW_CALLS = {
  'roboflow:account': (roboflow) => roboflow.account(),
  'roboflow:set-key': (roboflow, key) => roboflow.setKey(key),
  'roboflow:import': (roboflow, link) => roboflow.importProject(link),
};

const overHttp = (reply) => ({ name: reply.name, data: Buffer.from(reply.data).toString('base64') });

export const registerRoboflowHandlers = (ipcMain, roboflow) => registerCalls(ipcMain, ROBOFLOW_CALLS, roboflow);
export const roboflowPostRoutes = (roboflow) => postRoutesOf(ROBOFLOW_CALLS, roboflow, { 'roboflow:import': overHttp });
