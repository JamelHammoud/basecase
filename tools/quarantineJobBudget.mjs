const MINIMUM_REMAINING_MS = 120000;
const LOOKUP_MS = 5000;
const MAXIMUM_PAGES = 5;

async function currentJob({ env, fetchJson }) {
  const base = `${env.GITHUB_API_URL}/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;

  for (let page = 1; page <= MAXIMUM_PAGES; page += 1) {
    const body = await fetchJson(`${base}/attempts/${env.GITHUB_RUN_ATTEMPT}/jobs?per_page=100&page=${page}`);
    const job = body.jobs.find(
      (candidate) => candidate.runner_name === env.RUNNER_NAME && candidate.status === 'in_progress',
    );

    if (job) return job;

    if (body.jobs.length < 100) return undefined;
  }

  return undefined;
}

export async function jobRemainingMs({ env, fetchJson, now = Date.now }) {
  const minutes = Number(env.QUARANTINE_JOB_MINUTES);

  if (!env.GITHUB_ACTIONS || !env.GITHUB_TOKEN || Number.isNaN(minutes) || minutes <= 0) return Infinity;

  try {
    const job = await currentJob({ env, fetchJson });

    if (!job) return Infinity;

    return Date.parse(job.started_at) + minutes * 60000 - now();
  } catch {
    return Infinity;
  }
}

export function fetchGitHubJson(token) {
  return async (url) => {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(LOOKUP_MS),
    });

    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

    return response.json();
  };
}

export function hasObservationHeadroom(remainingMs) {
  return remainingMs >= MINIMUM_REMAINING_MS;
}
