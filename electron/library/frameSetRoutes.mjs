import path from 'node:path';
import { FrameSetStore } from './frameSetStore.mjs';

const stores = new WeakMap();

function frameSets(store) {
  if (!stores.has(store)) stores.set(store, new FrameSetStore({ dir: path.join(store.dir, '..', 'framesets') }));

  return stores.get(store);
}

export const FRAME_SET_CALLS = {
  'datasets:frame-sets': (store) => frameSets(store).list(),
  'datasets:frame-set-read': (store, id) => frameSets(store).read(id),
  'datasets:frame-set-save': (store, data) => frameSets(store).save(data),
  'datasets:frame-read': (store, id) => frameSets(store).frame(id),
  'datasets:frame-save': (store, payload) => frameSets(store).saveFrame(payload),
};
