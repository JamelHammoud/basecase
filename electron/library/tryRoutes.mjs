import { postRoutesOf, registerCalls } from '../callRoutes.mjs';

const fromBase64 = (value) => (typeof value === 'string' ? new Uint8Array(Buffer.from(value, 'base64')) : value);

const toBase64 = (bytes) => (bytes ? Buffer.from(bytes).toString('base64') : null);

const videosOf = (videos) =>
  videos && typeof videos === 'object' && !Array.isArray(videos)
    ? Object.fromEntries(Object.entries(videos).map(([camera, bytes]) => [camera, fromBase64(bytes)]))
    : videos;

const saved = (payload) => ({
  record: payload?.record,
  recording: fromBase64(payload?.recording),
  videos: videosOf(payload?.videos),
});

export const TRY_CALLS = {
  'tries:list': (tries) => tries.list(),
  'tries:save': (tries, payload) => tries.save(saved(payload)),
  'tries:open': (tries, id) => tries.open(id),
  'tries:film': (tries, id) => ({ data: tries.film(id) }),
  'tries:save-film': (tries, payload) => tries.saveFilm({ id: payload?.id, film: fromBase64(payload?.film) }),
  'tries:delete': (tries, payload) => tries.delete(payload?.ids),
};

const overHttp = {
  'tries:open': (opened) => opened && { ...opened, recording: toBase64(opened.recording) },
  'tries:film': ({ data }) => ({ data: toBase64(data) }),
};

export const registerTryHandlers = (ipcMain, tries) => registerCalls(ipcMain, TRY_CALLS, tries);

export const tryPostRoutes = (tries) => postRoutesOf(TRY_CALLS, tries, overHttp);
