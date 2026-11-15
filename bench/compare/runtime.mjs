const MAX_MINUTES = 30;
const MAX_TASK_SECONDS = 120;

function positiveOption(args, name, cap) {
  const at = args.indexOf(`--${name}`);
  const value = at < 0 ? cap : Number(args[at + 1]);

  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${name} must be a positive finite number.`);

  return Math.min(cap, value);
}

export function comparisonLimits(args) {
  return {
    minutes: positiveOption(args, 'minutes', MAX_MINUTES),
    taskSeconds: positiveOption(args, 'task-seconds', MAX_TASK_SECONDS),
  };
}

const timeoutError = (code) => Object.assign(new Error(`Comparison ${code} reached.`), { code });

export async function bounded(fn, { deadline, seconds = Infinity, late }) {
  const remaining = deadline - Date.now();
  const code = remaining <= seconds * 1000 ? 'deadline' : 'task-timeout';
  const endsAt = Math.min(deadline, Date.now() + seconds * 1000);

  if (remaining <= 0) throw timeoutError('deadline');

  const controller = new AbortController();
  let expired = false;
  let timer;
  const work = Promise.resolve().then(() => fn(controller.signal));
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => {
        expired = true;
        controller.abort(timeoutError(code));
        reject(timeoutError(code));
      },
      Math.min(remaining, seconds * 1000),
    );
  });

  work
    .then(
      (value) => expired && late?.(value),
      () => {},
    )
    .catch(() => {});

  try {
    const value = await Promise.race([work, timeout]);

    if (Date.now() >= endsAt) {
      controller.abort(timeoutError(code));
      Promise.resolve(late?.(value)).catch(() => {});

      throw timeoutError(code);
    }

    return value;
  } finally {
    clearTimeout(timer);
  }
}

function failedRun(job, err, seconds) {
  const timedOut = err.code === 'deadline' || err.code === 'task-timeout';

  return {
    task: job.task.id,
    seed: job.seed,
    model: job.label,
    status: timedOut ? 'fail' : 'error',
    seconds,
    timedOut,
    timeout: timedOut ? err.code : null,
    detail: err.message,
  };
}

function retire(slot) {
  slot.retired = true;

  if (slot.onEvent) slot.onEvent.current = null;

  Promise.resolve()
    .then(() => slot.post?.('/api/bridge/acp-cancel'))
    .catch(() => {});
}

export function guardedSlot(slot, signal) {
  const guarded = { ...slot };

  for (const method of ['api', 'call', 'post']) {
    guarded[method] = async (...args) => {
      signal.throwIfAborted();

      const value = await slot[method](...args);

      signal.throwIfAborted();

      return value;
    };
  }

  return guarded;
}

export function guardedOutput(out, signal, endsAt = Infinity) {
  return {
    ...out,
    get git() {
      signal.throwIfAborted();

      if (Date.now() >= endsAt) throw timeoutError('task-timeout');

      return out.git;
    },
  };
}

async function runJob(job, slot, options) {
  const started = Date.now();
  const { deadline, taskSeconds, run, record, state } = options;

  try {
    record(await bounded((signal) => run(job, guardedSlot(slot, signal), signal), { deadline, seconds: taskSeconds }));
  } catch (err) {
    const result = failedRun(job, err, (Date.now() - started) / 1000);

    if (result.timedOut) retire(slot);

    if (err.code === 'deadline' || Date.now() >= deadline) state.stop = 'deadline';

    record(result);
  }
}

export async function runBoundedJobs({ slots, jobs, state = { stop: null }, ...options }) {
  const queue = [...jobs];

  await Promise.all(
    slots.map(async (slot) => {
      while (queue.length && !state.stop && !slot.retired) {
        if (Date.now() >= options.deadline) {
          state.stop = 'deadline';

          break;
        }

        await runJob(queue.shift(), slot, { ...options, state });
      }
    }),
  );

  if (queue.length && !state.stop) state.stop = 'slots';
}
