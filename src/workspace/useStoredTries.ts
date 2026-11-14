import { useSyncExternalStore } from 'react';
import { storedTries, subscribeTries } from '../cases/tryStore';

export const useStoredTries = () => useSyncExternalStore(subscribeTries, storedTries);
