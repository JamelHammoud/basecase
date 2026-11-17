import { useEffect, useEffectEvent, useRef, type RefObject } from 'react';
import { geometryWorker } from '../three/geometryWorker';
import { prepareSupportJob } from '../utils/sketch/supportJob';
import { supportFailureParts } from '../utils/sketch/supportFailures';
import type { ScenePart } from '../types/robotics';
import type { DocState } from './types';
import { applySketchSupportResults } from './sketchSupportResults';
import { sketchSupportQueue } from './sketchSupportQueue';

export function useSketchSupportResults(
  parts: ScenePart[],
  docRef: RefObject<DocState>,
  writeDoc: (doc: DocState) => void,
) {
  const queueRef = useRef<ReturnType<typeof sketchSupportQueue<ScenePart[]>> | null>(null);
  const generation = useRef(0);
  const run = useEffectEvent(async (source: ScenePart[]) => {
    if (docRef.current.parts !== source) return;

    const job = prepareSupportJob(source);

    if (!job) return;

    const started = generation.current;
    const input = job.parts;
    const updated = job.bounded
      ? await geometryWorker.call('sketchSupports', { parts: input, force: job.force }).then(
          (result) => result.updated,
          () => supportFailureParts(input, 'profile'),
        )
      : supportFailureParts(input, 'limit');

    if (generation.current !== started) return;

    const before = docRef.current;
    const next = applySketchSupportResults(before, source, updated);

    if (next !== before) writeDoc(next);
  });

  useEffect(() => {
    const queue = sketchSupportQueue((source: ScenePart[]) => run(source));

    queueRef.current = queue;

    return () => {
      generation.current += 1;
      queue.dispose();
    };
  }, []);

  useEffect(() => {
    queueRef.current?.submit(parts);
  }, [parts]);
}
