import type { TrySplit } from '../cases/tryFile';
import { splitOf } from './datasetSplit';

export interface SourceAssignment {
  source: string;
  content: string;
  explicit?: TrySplit;
}

export function assignSources(inputs: SourceAssignment[], seed: number): TrySplit[] {
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    const path: string[] = [];
    let at = key;

    while (parents.has(at)) {
      path.push(at);
      at = parents.get(at)!;
    }

    for (const entry of path) parents.set(entry, at);

    return at;
  };

  for (const input of inputs) {
    const one = root(`source:${input.source}`);
    const two = root(`content:${input.content}`);

    if (one !== two) parents.set(one < two ? two : one, one < two ? one : two);
  }

  const keys = inputs.map((input) => root(`source:${input.source}`));
  const explicit = new Map<string, TrySplit>();

  inputs.forEach((input, i) => {
    if (!input.explicit) return;

    const prior = explicit.get(keys[i]);

    if (prior && prior !== input.explicit) throw new Error('The same source has conflicting dataset splits.');

    explicit.set(keys[i], input.explicit);
  });

  const held = new Set(splitOf([...new Set(keys)], seed).validation);

  return keys.map((key) => explicit.get(key) ?? (held.has(key) ? 'validation' : 'train'));
}

export const sourceRun = (scene: string | null, kase: string | null, seed: number) =>
  JSON.stringify(['run', scene, kase, seed]);
