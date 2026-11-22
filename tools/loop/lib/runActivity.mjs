export const STALL_AFTER_MS = 30 * 60_000;

const timestamps = (item) => [item.started_at, item.completed_at].map((value) => Date.parse(value));

export function runIsStalled(run, jobs, now) {
  const activity = [
    Date.parse(run.createdAt),
    ...jobs.flatMap((job) => [...timestamps(job), ...(job.steps ?? []).flatMap(timestamps)]),
  ].filter(Number.isFinite);

  return now - Math.max(...activity) > STALL_AFTER_MS;
}
