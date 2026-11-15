import { postRoutesOf, registerCalls } from '../callRoutes.mjs';
import { datasetContentBytes } from './datasetContent.mjs';

const bytes = (value) => {
  if (typeof value !== 'string') return value;

  if (value.length > 90 * 1024 * 1024) throw new Error('The image frame is too large');

  return new Uint8Array(Buffer.from(value, 'base64'));
};

export const DATASET_CALLS = {
  'datasets:content-save': (store, value) => store.saveContent(datasetContentBytes(value)),
  'datasets:content-load': (store, hash) => store.content(hash),
  'datasets:list': (store) => store.list(),
  'datasets:save': (store, dataset) => store.save(dataset),
  'datasets:delete': (store, ids) => store.delete(ids),
  'datasets:images-list': (store) => store.images.list(),
  'datasets:images-manifest': (store, id) => store.images.manifest(id),
  'datasets:images-frame': (store, payload) => store.images.frame(payload),
  'datasets:images-jpeg': (store, payload) => store.images.jpeg(payload),
  'datasets:images-save-frame': (store, payload) => store.images.saveFrame({ ...payload, jpeg: bytes(payload?.jpeg), depth: bytes(payload?.depth) }),
  'datasets:images-save-manifest': (store, payload) => store.images.saveManifest(payload),
  'datasets:images-finalize': (store, payload) => store.images.finalize(payload),
};

export const registerDatasetHandlers = (ipcMain, store) => registerCalls(ipcMain, DATASET_CALLS, store);

export const datasetPostRoutes = (store) => postRoutesOf(DATASET_CALLS, store, {
  'datasets:content-load': (value) => value && ({ data: Buffer.from(value).toString('base64') }),
  'datasets:images-jpeg': (jpeg) => jpeg && ({ data: Buffer.from(jpeg).toString('base64') }),
  'datasets:images-frame': (frame) => frame && ({ jpeg: Buffer.from(frame.jpeg).toString('base64'), depth: Buffer.from(frame.depth).toString('base64') }),
});
