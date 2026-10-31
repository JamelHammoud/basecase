import { useEffect, useEffectEvent, useRef } from 'react';
import type { BuildGuide } from './useBuildGuide';

const UPDATE_AFTER_MS = 15_000;

let backgroundRuns: Promise<unknown> = Promise.resolve();

interface GuideAutoUpdateOptions {
  guide: BuildGuide;
  enabled: boolean;
  agentBusy: boolean;
}

export function useGuideAutoUpdate({ guide, enabled, agentBusy }: GuideAutoUpdateOptions) {
  const triedRef = useRef('');
  const { fingerprint } = guide;
  const due = enabled && !agentBusy && !guide.progress && (guide.stale || guide.missing);

  const stillDue = () => due && triedRef.current !== guide.fingerprint;

  const update = useEffectEvent(() => {
    if (!stillDue()) return null;

    triedRef.current = guide.fingerprint;

    return guide.generate({ background: true });
  });

  const queue = useEffectEvent(() => {
    backgroundRuns = backgroundRuns.then(update, update);
  });

  useEffect(() => {
    if (!due || triedRef.current === fingerprint) return;

    const timer = window.setTimeout(queue, UPDATE_AFTER_MS);

    return () => window.clearTimeout(timer);
  }, [due, fingerprint]);
}
