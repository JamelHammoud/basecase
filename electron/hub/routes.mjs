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
  'hub:dataset-files': (hub, payload) => hub.datasetFiles(payload),
};

export const registerHubHandlers = (ipcMain, hub) => registerCalls(ipcMain, HUB_CALLS, hub);

const base64Files = (reply) => ({
  ...reply,
  files: Object.fromEntries(
    Object.entries(reply.files).map(([path, bytes]) => [path, Buffer.from(bytes).toString('base64')]),
  ),
});

export const hubPostRoutes = (hub) => postRoutesOf(HUB_CALLS, hub, { 'hub:dataset-files': base64Files });
