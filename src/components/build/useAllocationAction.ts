import { useRef, useState } from 'react';
import { refreshPurchases } from './usePurchases';

export function useAllocationAction(onError: (error: unknown) => void) {
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);

  const run = async (action: () => Promise<unknown>) => {
    if (writing.current) return;

    writing.current = true;
    setBusy(true);

    try {
      await action();
    } catch (error) {
      onError(error);
      await refreshPurchases().catch(onError);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  return { busy, run };
}
