import { useEffect } from 'react';
import { useLatestRef } from '../utils/useLatestRef';
import { blankSeed } from './tabModel';
import type { useTabs } from './useTabs';

type Tabs = ReturnType<typeof useTabs>;

export function useDevTabsHook(core: Tabs) {
  const coreRef = useLatestRef(core);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    (window as unknown as { __studioTabs?: unknown }).__studioTabs = {
      list: () => ({
        ids: coreRef.current.latestRef.current.tabs.map((t) => t.id),
        activeId: coreRef.current.latestRef.current.activeId,
      }),
      open: () => coreRef.current.openTab(blankSeed(coreRef.current.latestRef.current.metas)),
      select: (id: string) => coreRef.current.selectTab(id),
    };
  }, [coreRef]);
}
