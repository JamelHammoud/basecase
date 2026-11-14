import { TRY_SOURCE_BADGE, type StoredTry, type TrySource } from '../tryFile';
import { motionKey, motionSignature } from './motion';
import { weightedTerms } from './searchTerms';
import type { IndexedTry } from './types';

const CASE_BOOST = 2;

const sourceText = (source: TrySource) => [TRY_SOURCE_BADGE[source], source].filter(Boolean).join(' ');

function quantized(vector: ArrayLike<number>): number[] {
  let norm = 0;

  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];

  const scale = norm > 0 ? 127 / Math.sqrt(norm) : 0;

  return Array.from(vector, (v) => Math.round(v * scale));
}

export function indexedTryOf(stored: StoredTry, stamp: number): IndexedTry {
  const time = Date.parse(stored.startedAt);

  return {
    id: stored.id,
    label: stored.case?.name ?? stored.robot.name,
    robot: stored.robot.name,
    sceneId: stored.sceneId,
    input: stored.input,
    source: stored.source,
    verdict: stored.outcome.verdict,
    seconds: stored.seconds,
    startedAt: stored.startedAt,
    time: Number.isFinite(time) ? time : 0,
    faulted: stored.faults.length > 0,
    terms: weightedTerms([
      { text: stored.case?.name ?? '', boost: CASE_BOOST },
      { text: stored.task ?? '', boost: 1 },
      { text: stored.robot.name, boost: 1 },
      { text: sourceText(stored.source), boost: 1 },
      { text: stored.input ?? '', boost: 1 },
    ]),
    motionKey: stored.motion ? motionKey(stored.motion) : null,
    signature: stored.motion ? quantized(motionSignature(stored.motion)) : null,
    stamp,
  };
}
