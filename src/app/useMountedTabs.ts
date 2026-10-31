import { useEffect, useState } from 'react';
import { afterFirstFrame } from '../utils/afterFirstFrame';
import { whenIdle } from '../utils/whenIdle';
import type { TabEntry } from './tabModel';

export function useMountedTabs(tabs: TabEntry[], activeId: string) {
  const [mounted, setMounted] = useState(() => new Set([activeId]));
  const next = tabs.find((t) => !mounted.has(t.id))?.id;

  if (!mounted.has(activeId)) setMounted(new Set(mounted).add(activeId));

  useEffect(() => {
    if (!next || next === activeId) return;

    let cancelIdle = () => {};
    const cancelFrame = afterFirstFrame(() => {
      cancelIdle = whenIdle(() => setMounted((prev) => new Set(prev).add(next)));
    });

    return () => {
      cancelFrame();
      cancelIdle();
    };
  }, [next, activeId]);

  return (id: string) => id === activeId || mounted.has(id);
}
