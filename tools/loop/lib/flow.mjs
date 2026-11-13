export const LIMITS = {
  openWaiting: 12,
  maxOpenHours: 6,
  queuedRuns: 20,
  mainRedHours: 2,
  noMergeHours: 2,
  readyWaitingHours: 2,
  oldestQueuedMinutes: 60,
};

export const PRODUCERS = new Set(['build', 'refine', 'market', 'learn', 'update', 'lead', 'ideas']);

export const LANE_SHARE = { refine: 3 };

const hoursSince = (iso, now) => (iso ? (now - Date.parse(iso)) / 3_600_000 : null);

export function expired({ pulls, inBatch, now = Date.now() }) {
  const limitMs = LIMITS.maxOpenHours * 3_600_000;

  return pulls.filter(
    (pull) =>
      !pull.headRefName.startsWith('loop/batch/') &&
      !pull.headRefName.startsWith('loop/repair/') &&
      !inBatch.includes(pull.number) &&
      now - Date.parse(pull.createdAt) > limitMs,
  );
}

export const laneOf = (branch) => /^loop\/([^/]+)\//.exec(branch)?.[1] ?? null;

export function backpressure({ openWaiting, queuedRuns, byLane = {} }, lane = null) {
  if (openWaiting >= LIMITS.openWaiting) return `${openWaiting} pull requests are waiting to land`;

  if (queuedRuns >= LIMITS.queuedRuns) return `${queuedRuns} CI runs are queued`;

  const own = byLane[lane] ?? 0;

  if (own >= (LANE_SHARE[lane] ?? Infinity)) return `${own} of its own pull requests are waiting to land`;

  return null;
}

export function breaches(m, now = Date.now()) {
  const found = [];
  const red = hoursSince(m.mainRedSince, now);
  const sinceMerge = hoursSince(m.lastMergeAt, now);
  const ready = hoursSince(m.oldestReadyAt, now);
  const queued = hoursSince(m.oldestQueuedAt, now);

  if (red !== null && red > LIMITS.mainRedHours) found.push(`main has been red for ${red.toFixed(1)} h`);

  if (m.readyCount > 0 && sinceMerge !== null && sinceMerge > LIMITS.noMergeHours)
    found.push(`nothing has merged for ${sinceMerge.toFixed(1)} h while ${m.readyCount} reviewed pull requests wait`);

  if (ready !== null && ready > LIMITS.readyWaitingHours)
    found.push(`a reviewed, green pull request has waited ${ready.toFixed(1)} h`);

  if (m.queuedRuns >= LIMITS.queuedRuns) found.push(`${m.queuedRuns} CI runs are queued`);

  if (queued !== null && queued * 60 > LIMITS.oldestQueuedMinutes)
    found.push(`the oldest queued CI run has waited ${Math.round(queued * 60)} min`);

  return found;
}

export const redSince = (runs) => {
  const finished = runs.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== 'skipped');
  const firstGreen = finished.findIndex((r) => r.conclusion === 'success');
  const red = firstGreen === -1 ? finished : finished.slice(0, firstGreen);

  return red.length > 0 ? red.at(-1).createdAt : null;
};

const latest = (times) => times.filter(Boolean).sort().at(-1) ?? null;

export const readySince = (pull) => {
  const rollup = pull.statusCheckRollup ?? [];
  const check = rollup.find((entry) => entry.__typename === 'CheckRun' && entry.name === 'check');
  const review = rollup.find((entry) => entry.__typename === 'StatusContext' && entry.context === 'agent-review');

  return latest([check?.completedAt, review?.startedAt]);
};

export const lastMergeAt = (merged) => latest(merged.map((pull) => pull.mergedAt));

export function syncPlan(wanted, installed, busy = new Set()) {
  const want = new Map(wanted.map((job) => [job.name, job.contents]));
  const have = new Map(installed.map((job) => [job.name, job.contents]));
  const change = [...want.keys()].filter((name) => have.has(name) && have.get(name) !== want.get(name));
  const remove = [...have.keys()].filter((name) => !want.has(name));
  const idle = (name) => !busy.has(name);

  return {
    add: [...want.keys()].filter((name) => !have.has(name)),
    change: change.filter(idle),
    remove: remove.filter(idle),
    busy: [...change, ...remove].filter((name) => busy.has(name)),
  };
}
