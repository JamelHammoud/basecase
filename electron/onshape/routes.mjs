import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const ONSHAPE_CALLS = {
  'onshape:account': (onshape) => onshape.account(),
  'onshape:set-key': (onshape, payload) => onshape.setKey(payload),
  'onshape:import': (onshape, payload) => onshape.importAssembly(payload),
};

const base64Files = (got) => ({
  ...got,
  files: Object.fromEntries(Object.entries(got.files).map(([k, v]) => [k, Buffer.from(v).toString('base64')])),
});

const OVER_HTTP = { 'onshape:import': base64Files };

export const registerOnshapeHandlers = (ipcMain, onshape) => registerCalls(ipcMain, ONSHAPE_CALLS, onshape);

export const onshapePostRoutes = (onshape) => postRoutesOf(ONSHAPE_CALLS, onshape, OVER_HTTP);
