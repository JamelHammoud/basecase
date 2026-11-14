import { useRef, useState } from 'react';
import type { WatchPlan } from '../skills/liveWatch';
import type { SimRequest } from './sim.worker';

export function useWatch(send: (msg: SimRequest) => void, watched: { id: number; margin: number } | null) {
  const seq = useRef(0);
  const [id, setId] = useState<number | null>(null);

  return {
    watch: (plan: WatchPlan | null) => {
      const next = plan ? ++seq.current : null;

      setId(next);
      send({ type: 'watch', watch: plan && next ? { ...plan, id: next } : null });
    },
    watchMargin: watched && watched.id === id ? watched.margin : null,
  };
}
