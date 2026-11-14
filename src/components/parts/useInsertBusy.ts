import { useState } from 'react';

export function useInsertBusy() {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, task: () => Promise<unknown> | void) => {
    if (busy) return;

    setBusy(key);

    try {
      await task();
    } finally {
      setBusy(null);
    }
  };

  return { busy: busy !== null, run };
}

export type InsertBusy = ReturnType<typeof useInsertBusy>;
