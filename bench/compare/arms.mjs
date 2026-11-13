import { cachedRuns } from './cache.mjs';
import { harnessPair } from './against.mjs';

export const TREE_LABEL = 'working tree';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export const servedFor = (arg) => (/^claude-/i.test(arg) ? arg : null);

export const modelArms = ({ labels, harness, source, git }) =>
  labels.map((label) => ({ label, model: label, harness, source, git, cache: true }));

export function againstArms({ model, tree, ref, gitOf }) {
  const keys = harnessPair({ tree, ref });

  return [
    { label: TREE_LABEL, model, harness: keys.tree, source: tree, git: gitOf(tree), cache: false },
    { label: ref.label, model, harness: keys.ref, source: ref.dir, git: gitOf(ref.dir), cache: true },
  ];
}

export function armCache(index, arm, { effort, useCache }) {
  if (!useCache || !arm.cache) return new Map();

  return cachedRuns(index, { harness: arm.harness, effort, served: servedFor(arm.model) });
}

export const dirOf = (label) => label.replace(/[^\w.-]+/g, '-');
