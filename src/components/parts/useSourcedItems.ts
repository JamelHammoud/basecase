import { useEffect, useSyncExternalStore } from 'react';
import { loadSourced } from '../../data/loadSourced';
import { sourcedItems, subscribeSourced, type SourcedItem } from '../../data/sourcedItems';

export function useSourcedItems(): SourcedItem[] {
  useEffect(() => {
    void loadSourced();
  }, []);

  return useSyncExternalStore(subscribeSourced, sourcedItems);
}
