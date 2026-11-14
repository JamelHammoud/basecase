import { storeRefusal, type StoreValue } from '../caseStore';
import type { StudioMessage } from './codeProtocol';
import type { BridgeClock } from './codeSignals';

export interface BridgeStore {
  get: () => StoreValue | null;
  set: (value: StoreValue) => void;
}

export const storeGetReply = (id: number, store: BridgeStore): StudioMessage => ({
  type: 'store',
  id,
  ok: true,
  value: store.get(),
});

export function storeSetReply(m: { id: number; value: unknown }, store: BridgeStore): StudioMessage {
  const refusal = storeRefusal(m.value);

  if (refusal) return { type: 'store', id: m.id, ok: false, problem: `the value ${refusal}` };

  store.set(m.value as StoreValue);

  return { type: 'store', id: m.id, ok: true };
}

export const STORE_WRITE_MS = 500;

export function coalescedStore(store: BridgeStore, clock: BridgeClock): BridgeStore & { flush: () => void } {
  let pending: { value: StoreValue } | null = null;
  let written: { value: StoreValue } | null = null;
  let cancel: (() => void) | null = null;

  const flush = () => {
    cancel?.();
    cancel = null;

    if (pending) store.set(pending.value);

    written = pending ?? written;
    pending = null;
  };

  const saved = () => {
    const value = store.get();

    if (written && value !== written.value) return written.value;

    written = null;

    return value;
  };

  return {
    get: () => (pending ? pending.value : saved()),
    set: (value) => {
      pending = { value };
      cancel ??= clock.after(STORE_WRITE_MS, flush);
    },
    flush,
  };
}
