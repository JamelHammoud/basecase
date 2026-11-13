import { useEffect, useEffectEvent, type RefObject } from 'react';
import { evaluateBoolean, knownResult } from '../booleans/evaluate';
import { partsWithResults, staleBooleans } from '../booleans/results';
import type { ScenePart } from '../types/robotics';
import { patchEveryState } from './docHistory';
import type { DocState } from './types';

export function useBooleanResults(
  parts: ScenePart[],
  docRef: RefObject<DocState>,
  writeDoc: (next: DocState) => void,
): void {
  const applyResults = useEffectEvent(() => {
    const d = docRef.current;
    const next = patchEveryState(d, (ps) => partsWithResults(ps, knownResult));

    if (next !== d) writeDoc(next);
  });

  useEffect(() => {
    const stale = staleBooleans(parts);

    if (stale.length === 0) return;

    let current = true;

    void Promise.all(stale.map(evaluateBoolean)).then(() => {
      if (current) applyResults();
    });

    return () => {
      current = false;
    };
  }, [parts]);
}
