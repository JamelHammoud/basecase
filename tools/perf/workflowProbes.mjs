function installEvents() {
  window.__basecaseTestHooks = true;

  const sources = new Set();
  const metrics = {
    workers: [],
    cancelled: [],
    long: [],
    frames: [],
    held: [],
    terminated: 0,
    inputs: [],
    replies: [],
    orbits: [],
    watch: null,
  };
  const nativeFetch = window.fetch.bind(window);

  Object.assign(window, {
    fetch: (input, init) => {
      const url = input?.url ?? String(input);

      if (url.endsWith('/agent-respond') && typeof init?.body === 'string') {
        const { requestId } = JSON.parse(init.body);

        metrics.replies.push({ requestId, at: performance.now() });
      }

      return nativeFetch(input, init);
    },
    __workflow: metrics,
    __workflowWatch: (kind, expected) => {
      metrics.watch = { kind, expected, input: null };
    },
    __workflowEmit: (event) => {
      for (const source of sources) source.onmessage?.({ data: JSON.stringify(event) });
    },
    __workflowRelease: () => {
      window.__workflowHold = false;

      for (const deliver of metrics.held.splice(0)) deliver();
    },
    EventSource: class {
      onmessage = null;
      constructor() {
        sources.add(this);
      }
      close() {
        sources.delete(this);
      }
    },
  });
}

function installWorkers() {
  const NativeWorker = window.Worker;
  const pending = new Map();
  const urls = new WeakMap();
  const identities = new WeakMap();
  let nextIdentity = 0;
  const identity = (value) => {
    if (!value || typeof value !== 'object') return value;

    if (!identities.has(value)) identities.set(value, ++nextIdentity);

    return identities.get(value);
  };
  const metrics = window.__workflow;

  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args);
      urls.set(this, String(args[0]));

      let handler = null;

      Object.defineProperty(this, 'onmessage', {
        get: () => handler,
        set: (value) => {
          handler = value;
        },
      });
      this.addEventListener('message', (event) => {
        const job = pending.get(this)?.get(event.data.id);

        if (job) {
          job.ms = performance.now() - job.at;
          job.preparation = event.data.result?.metrics;
          job.preparedModel = event.data.reply?.modelHash;

          const stopped = job.stopFlag && Atomics.load(job.stopFlag, 0) !== 0;

          delete job.stopFlag;

          const target = stopped ? metrics.cancelled : metrics.workers;

          target.push(
            stopped
              ? { ...job, cancellation: 'cooperative', workerReplied: true, error: event.data.error ?? null }
              : job,
          );
          pending.get(this).delete(event.data.id);
        }

        const deliver = () => handler?.call(this, event);

        if (job?.op === 'agentPart' && window.__workflowHold) metrics.held.push(deliver);
        else deliver();
      });
    }
    postMessage(...args) {
      const request = args[0];
      const task = request.payload?.task;
      const instances = task?.instances ?? [];
      const job = {
        op: request.op ?? request.type ?? 'prepare',
        worker: urls.get(this),
        fields: Object.keys(request),
        caseJob: request.job
          ? { type: request.job.type, case: request.job.kase?.id, model: request.job.modelHash }
          : undefined,
        stopFlag: request.job?.stopFlag,
        analysis: task
          ? {
              kind: task.kind,
              count: instances.length,
              sources: [...instances.slice(0, 2), ...instances.slice(-2)],
              newShapes: request.payload.shapes?.length,
            }
          : undefined,
        at: performance.now(),
        sendMs: 0,
        source: request.input
          ? Object.fromEntries(Object.entries(request.input).map(([key, value]) => [key, identity(value)]))
          : undefined,
      };

      if (!pending.has(this)) pending.set(this, new Map());

      pending.get(this).set(request.id, job);
      super.postMessage(...args);
      job.sendMs = performance.now() - job.at;
    }
    terminate() {
      metrics.terminated++;

      for (const job of pending.get(this)?.values() ?? [])
        metrics.cancelled.push({
          ...job,
          stopFlag: undefined,
          ms: performance.now() - job.at,
          cancellation: 'termination',
          workerReplied: false,
        });

      pending.delete(this);
      super.terminate();
    }
  };
}

function installInputs() {
  const metrics = window.__workflow;

  for (const type of ['pointerup', 'keydown'])
    document.addEventListener(
      type,
      (event) => {
        const watch = metrics.watch;
        const wanted = watch?.kind === 'edit' ? 'keydown' : 'pointerup';

        if (watch && type === wanted && watch.input === null) watch.input = event.timeStamp;
      },
      true,
    );

  document.addEventListener(
    'wheel',
    (event) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;

      const point = window.__studio?.projectPoints([[0, 0, 0]])[0];

      if (point) metrics.orbits.push({ at: event.timeStamp, point });
    },
    true,
  );
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) metrics.long.push({ at: entry.startTime, ms: entry.duration });
  }).observe({ type: 'longtask' });

  const observe = (at) => {
    const studio = window.__studio;
    const point = studio?.projectPoints([[0, 0, 0]])[0];
    const moved = metrics.orbits.filter(
      (input) => point && (Math.abs(point.x - input.point.x) > 0.1 || Math.abs(point.y - input.point.y) > 0.1),
    );

    metrics.orbits = metrics.orbits.filter((input) => !moved.includes(input));

    if (moved.length)
      requestAnimationFrame((paint) => {
        for (const input of moved)
          metrics.inputs.push({ kind: 'orbit', at: input.at, observed: at, paint, ms: paint - input.at });
      });

    const watch = metrics.watch;

    if (!watch || watch.input === null || !studio) return;

    const part = studio.sceneRecord().parts.find((p) => p.id === 'control');
    const matched = {
      select: () => studio.selection().includes('control'),
      edit: () => part?.position[0] === watch.expected,
    }[watch.kind]?.();

    if (!matched) return;

    metrics.watch = null;
    requestAnimationFrame((paint) =>
      metrics.inputs.push({ kind: watch.kind, at: watch.input, observed: at, paint, ms: paint - watch.input }),
    );
  };

  let previous = performance.now();

  const tick = (at) => {
    metrics.frames.push({ at, ms: at - previous });
    observe(at);
    previous = at;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

export const workflowProbeScript = () =>
  [installEvents, installWorkers, installInputs].map((install) => `(${install.toString()})();`).join('\n');

export function distribution(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

  return {
    count: sorted.length,
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: sorted.at(-1) ?? 0,
  };
}
