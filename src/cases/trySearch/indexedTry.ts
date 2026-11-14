import { originLabel, TRY_SOURCE_BADGE, type StoredTry, type TrySource } from '../tryFile';
import { motionKey, motionSignature } from './motion';
import { termsOf, weightedTerms } from './searchTerms';
import { SIGNATURE_SCALE, type IndexedTry } from './types';

const CASE_BOOST = 2;

const labelOf = (stored: StoredTry) =>
  stored.case?.name ?? stored.task ?? originLabel(stored.origin) ?? stored.robot.name;

const sourceText = (source: TrySource) => [TRY_SOURCE_BADGE[source], source].filter(Boolean).join(' ');

function quantized(vector: ArrayLike<number>): number[] {
  let norm = 0;

  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];

  const scale = norm > 0 ? SIGNATURE_SCALE / Math.sqrt(norm) : 0;

  return Array.from(vector, (v) => Math.round(v * scale));
}

export function indexedTryOf(stored: StoredTry, stamp: number): IndexedTry {
  const time = Date.parse(stored.startedAt);

  return {
    id: stored.id,
    label: labelOf(stored),
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
      { text: originLabel(stored.origin) ?? '', boost: 1 },
      { text: stored.input ?? '', boost: 1 },
    ]),
    named: [...new Set(termsOf(`${stored.case?.name ?? ''} ${stored.task ?? ''}`))],
    motionKey: stored.motion ? motionKey(stored.motion) : null,
    signature: stored.motion ? quantized(motionSignature(stored.motion)) : null,
    stamp,
  };
}
