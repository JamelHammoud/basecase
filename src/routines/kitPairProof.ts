import { kitBehavior, kitFailure } from './kitBehavior';
import { atHandoffPhase, PROOF_SEEDS, type PairMoves, type Prover } from './physicsProver';
import type { Handoff } from './schema';

export const KIT_PAIRS: Array<[string, string]> = [
  ['walk', 'settle'],
  ['settle', 'walk'],
  ['settle', 'turn-away'],
  ['turn-away', 'walk'],
  ['turn-away', 'settle'],
];

export const isKitPair = (pair: Handoff) => KIT_PAIRS.some(([a, b]) => a === pair.from && b === pair.to);

export interface KitPairCase extends Handoff, PairMoves {}

export function kitPairCases(pair: Handoff): KitPairCase[] {
  const turns = pair.from === 'turn-away' || pair.to === 'turn-away' ? [-90, 90] : [0];

  return turns.map((turn) => ({
    ...pair,
    ...(pair.from === 'turn-away' ? { fromMove: { turn } } : {}),
    ...(pair.to === 'turn-away' ? { toMove: { turn } } : {}),
  }));
}

export function proveKitPair(prover: Prover, pair: Handoff) {
  let falls = 0;
  let failures = 0;
  let reason: string | undefined;

  for (const check of kitPairCases(pair)) {
    const run = prover.run(check.from, check.to, atHandoffPhase(check.from), check);
    const failed = run.sampled.filter((s) => !kitBehavior(check.to, s, check.toMove)).length;

    if (failed > failures) reason = kitFailure(check, failed, PROOF_SEEDS);

    falls = Math.max(falls, run.falls);
    failures = Math.max(failures, failed);
  }

  return { falls, failures, ...(reason ? { reason } : {}) };
}
