import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

const fromBase64 = (value) => (typeof value === 'string' ? new Uint8Array(Buffer.from(value, 'base64')) : value);

const asBase64 = (bytes) => ({ data: bytes ? Buffer.from(bytes).toString('base64') : null });

export const TRY_CALLS = {
  'tries:list': (store) => store.list(),
  'tries:save': (store, payload) => store.save({ manifest: payload?.manifest, recording: fromBase64(payload?.recording) }),
  'tries:recording': (store, id) => store.recording(id),
  'tries:strip': (store, id) => store.strip(id),
  'tries:keep-strip': (store, payload) => store.saveStrip({ id: payload?.id, bytes: fromBase64(payload?.bytes) }),
  'tries:delete': (store, ids) => store.delete(ids),
  'tries:manifests': (store, ids) => store.manifests(ids),
  'tries:index': (store) => store.index(),
  'tries:keep-index': (store, payload) => store.saveIndex(fromBase64(payload?.bytes)),
};

const OVER_HTTP = { 'tries:recording': asBase64, 'tries:strip': asBase64, 'tries:index': asBase64 };

export const registerTryHandlers = (ipcMain, store) => registerCalls(ipcMain, TRY_CALLS, store);

export const tryPostRoutes = (store) => postRoutesOf(TRY_CALLS, store, OVER_HTTP);
