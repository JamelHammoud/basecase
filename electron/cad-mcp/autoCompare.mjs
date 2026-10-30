import { chatReferences, loadReference } from './references.mjs';
import { bridge } from './shared.mjs';
import { measureSilhouette, verdictLine } from './silhouetteMeasure.mjs';

const MAX_REFERENCES = 4;
const STRAIGHT_VIEWS = ['front', 'side'];
const state = { blockOutPending: false, lastKey: null };

export const noteBlockOut = () => {
  state.blockOutPending = true;
};

export const blockOutPending = () => state.blockOutPending;

const counted = (p) => p.bounds && !p.hidden && p.role !== 'reference' && p.role !== 'cutout' && !p.referenceImage;

function sceneKey(scene) {
  const parts = (scene?.parts ?? []).filter(counted);

  return parts.map((p) => `${p.id}:${[...p.bounds.min, ...p.bounds.max].map(Math.round).join(',')}`).join(';');
}

async function verdictFor(name) {
  try {
    const ref = await loadReference(name);

    return verdictLine(name, await measureSilhouette({ ref, views: STRAIGHT_VIEWS }));
  } catch (err) {
    return `${name}: not measured (${String(err?.message ?? err)}).`;
  }
}

export async function autoCompareText() {
  state.blockOutPending = false;

  const names = (await chatReferences()).slice(0, MAX_REFERENCES);

  if (!names.length) return '';

  const scene = sceneKey(await bridge('snapshot', {}).catch(() => null));
  const key = `${scene}|${names.join(',')}`;

  if (!scene || key === state.lastKey) return '';

  state.lastKey = key;

  const lines = [];

  for (const name of names) lines.push(await verdictFor(name));

  return [
    '',
    'Reference check (automatic): the width of each tenth of the height, photo against your model in the straight view that matches it best, flagged beyond ±15%.',
    ...lines.map((l) => `- ${l}`),
    'Fix flagged bands that are shape errors; skip bands where the photo is posed differently (hands, head turn). compare shows a reference beside your model.',
  ].join('\n');
}
