import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ScenePart } from '../types/robotics';
import { platformBridge, type RenderedCad } from '../utils/platformBridge';
import { compiledDoc, isCompiled, pendingCompiles, type CadCompileJob } from './cadCompile';
import type { SceneDocument } from './useSceneDocument';

const MAX_IN_FLIGHT = 2;

const FAILED: RenderedCad = { ok: false };

export function useCadCompile(docs: SceneDocument) {
  const { parts, docRef } = docs;
  const inFlightRef = useRef(new Set<string>());
  const failedRef = useRef(new Set<string>());
  const [settled, setSettled] = useState(0);

  const finish = (job: CadCompileJob, rendered: RenderedCad) => {
    inFlightRef.current.delete(job.key);

    if (isCompiled(rendered)) docs.writeDoc(compiledDoc(docRef.current, job.key, rendered));
    else failedRef.current.add(job.key);

    setSettled((n) => n + 1);
  };

  const startCompiles = useEffectEvent((current: ScenePart[]) => {
    const inFlight = inFlightRef.current;
    const skip = new Set([...inFlight, ...failedRef.current]);

    for (const job of pendingCompiles(current, skip, MAX_IN_FLIGHT - inFlight.size)) {
      inFlight.add(job.key);
      void platformBridge
        .renderCad(job.language, job.code)
        .catch(() => FAILED)
        .then((rendered) => finish(job, rendered));
    }
  });

  useEffect(() => {
    startCompiles(parts);
  }, [parts, settled]);
}
