import { isPolicySpec, type PolicySpec } from '../sim/policy';
import type { ForgeFactory } from '../skills/skillsRuntime';
import type { SnapshotRef, Snapshots } from '../skills/snapshots';
import { trainingProgress } from '../skills/trainerForge';

const ITERATIONS_PER_SNAPSHOT = 50;

export interface TrainerStub {
  forge: ForgeFactory;
  snapshots: Snapshots;
  release: () => void;
}

export function trainerStub(policy: unknown, snapshots: unknown[] = []): TrainerStub {
  if (!isPolicySpec(policy) || !snapshots.every(isPolicySpec)) throw new Error('stubTrainer takes policies.');

  const specs = snapshots as PolicySpec[];
  const queue: SnapshotRef[] = specs.map((s, i) => ({
    run: 'policy-stub',
    iteration: (i + 1) * ITERATIONS_PER_SNAPSHOT,
    steps: s.trainedSteps,
  }));
  const byIteration = new Map(queue.map((ref, i) => [ref.iteration, specs[i]]));
  let waiting: (() => void) | null = null;
  const pause = () =>
    new Promise<void>((resolve) => {
      waiting = resolve;
    });

  return {
    forge:
      ({ onSnapshot, onProgress }) =>
      async () => {
        const due = queue.splice(0);

        for (const [i, ref] of due.entries()) {
          const progress = trainingProgress('progress', { progress: { elapsedS: i, budgetS: due.length } });

          if (progress) onProgress(progress);

          onSnapshot?.(ref);
          await pause();
        }

        return { ok: true, policy, events: [{ type: 'done', steps: 1 }], stderr: '' };
      },
    snapshots: {
      load: (ref) => Promise.resolve(byIteration.get(ref.iteration) ?? null),
      keep: (_hash, refs) => Promise.resolve(refs),
    },
    release: () => {
      const next = waiting;

      waiting = null;
      next?.();
    },
  };
}
