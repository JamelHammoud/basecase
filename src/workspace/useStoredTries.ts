import { useEffect, useSyncExternalStore } from 'react';
import type { StoredTry } from '../cases/storedTry';
import { listTries, storedTriesNow, subscribeTries } from '../cases/tryStore';

export function useStoredTries(): StoredTry[] | null {
  const tries = useSyncExternalStore(subscribeTries, storedTriesNow);

  useEffect(() => {
    void listTries();
  }, []);

  return tries;
}
