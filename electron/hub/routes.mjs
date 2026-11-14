import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

const fromBase64 = (value) => (typeof value === 'string' ? new Uint8Array(Buffer.from(value, 'base64')) : value);

const withBytes = (payload) => ({
  ...payload,
  files: Object.fromEntries(Object.entries(payload?.files ?? {}).map(([path, bytes]) => [path, fromBase64(bytes)])),
});

export const HUB_CALLS = {
  'hub:account': (hub) => hub.account(),
  'hub:sign-in': (hub, token) => hub.signIn(token),
  'hub:publish': (hub, payload) => hub.publish(withBytes(payload)),
  'hub:skill-files': (hub, payload) => hub.skillFiles(payload),
};

export const registerHubHandlers = (ipcMain, hub) => registerCalls(ipcMain, HUB_CALLS, hub);

export const hubPostRoutes = (hub) => postRoutesOf(HUB_CALLS, hub);
