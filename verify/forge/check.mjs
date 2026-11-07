export const PROGRESS_KEYS = ['iteration', 'steps', 'elapsedS', 'budgetS', 'reward', 'episodeS', 'fps', 'phases'];
export const F1_MIN_FPS = 40000;
export const SAMPLE_RATIO_LIMIT = 1.2;

export function eventProblems(lines) {
  const progress = lines.filter((l) => l.type === 'progress');
  const done = lines.filter((l) => l.type === 'done');

  if (!progress.length) return ['No progress events'];

  if (done.length !== 1) return [`Expected one done event, saw ${done.length}`];

  const missing = PROGRESS_KEYS.filter((k) => progress.at(-1)[k] === undefined);
  const evalKeys = ['fellAt', 'seconds', 'forward', 'travelled'].filter((k) => done[0].eval?.[k] === undefined);

  return [
    ...missing.map((k) => `Progress is missing ${k}`),
    ...evalKeys.map((k) => `Eval is missing ${k}`),
    ...(typeof done[0].steps === 'number' ? [] : ['Done is missing steps']),
  ];
}

export const median = (values) => {
  const v = [...values].sort((a, b) => a - b);

  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};

export function sampleRatioProblem(forgeSteps, pythonSteps) {
  if (forgeSteps.some((s) => s === null)) return 'Forge missed the skill on a seed';

  const ratio = median(forgeSteps) / median(pythonSteps.filter((s) => s !== null));

  return ratio > SAMPLE_RATIO_LIMIT ? `Forge needs ${ratio.toFixed(2)}x the samples of Python` : null;
}
