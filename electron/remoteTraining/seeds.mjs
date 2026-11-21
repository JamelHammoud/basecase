export function seedSettings(value = {}) {
  const attempts = value.attempts ?? 1;
  const concurrency = value.concurrency ?? 1;

  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 4)
    throw new Error('Choose between 1 and 4 training attempts.');

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2)
    throw new Error('Choose 1 or 2 concurrent attempts.');

  return { attempts, concurrency };
}

export function seedJobs(job, settings) {
  const { attempts } = seedSettings(settings);

  if (!Number.isFinite(job.minutes) || job.minutes <= 0 || job.minutes > 60)
    throw new Error('Use a training budget between 0 and 60 minutes.');

  if (job.maxIterations !== undefined && (!Number.isSafeInteger(job.maxIterations) || job.maxIterations < attempts))
    throw new Error('The iteration budget must cover every training attempt.');

  const seed = job.seed ?? 1;

  if (!Number.isSafeInteger(seed) || seed < 0 || seed > Number.MAX_SAFE_INTEGER - attempts)
    throw new Error('Choose a whole training seed within the supported range.');

  return Array.from({ length: attempts }, (_, index) => ({
    ...job,
    minutes: job.minutes / attempts,
    seed: seed + index,
    threads: 1,
    backend: 'mujoco',
    snapshotEveryS: undefined,
    gateEvery: undefined,
    ...(job.maxIterations === undefined
      ? {}
      : { maxIterations: Math.floor(job.maxIterations / attempts) + Number(index < job.maxIterations % attempts) }),
  }));
}
