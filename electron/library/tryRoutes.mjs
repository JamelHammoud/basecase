import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

const fromBase64 = (value) => (typeof value === 'string' ? Buffer.from(value, 'base64') : value);

const toBase64 = (bytes) => (bytes ? Buffer.from(bytes).toString('base64') : null);

const withBytes = (payload) => ({
  ...payload,
  recording: fromBase64(payload?.recording),
  film: fromBase64(payload?.film),
});

export const TRY_CALLS = {
  'tries:list': (tries) => tries.list(),
  'tries:save': (tries, payload) => tries.save(withBytes(payload)),
  'tries:recording': (tries, id) => tries.recording(id),
  'tries:film': (tries, id) => tries.film(id),
  'tries:delete': (tries, ids) => tries.delete(ids),
};

const BYTES_OVER_HTTP = { 'tries:recording': toBase64, 'tries:film': toBase64 };

export const registerTryHandlers = (ipcMain, tries) => registerCalls(ipcMain, TRY_CALLS, tries);

export const tryPostRoutes = (tries) => postRoutesOf(TRY_CALLS, tries, BYTES_OVER_HTTP);
