import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

export const EARTH_CALLS = {
  'earth:account': (earth) => earth.account(),
  'earth:set-key': (earth, key) => earth.setKey(key),
  'earth:tile': (earth, path) => earth.tile(path),
};

const tileOverHttp = (reply) => ({ data: Buffer.from(reply.data).toString('base64') });

export const registerEarthHandlers = (ipcMain, earth) => registerCalls(ipcMain, EARTH_CALLS, earth);

export const earthPostRoutes = (earth) => postRoutesOf(EARTH_CALLS, earth, { 'earth:tile': tileOverHttp });
