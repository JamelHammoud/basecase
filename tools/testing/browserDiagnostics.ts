import type { Page, Worker } from 'playwright-core';

function workerResources() {
  return {
    clock: performance.now(),
    resources: performance
      .getEntriesByType('resource')
      .slice(-8)
      .map((entry) => ({
        path: new URL(entry.name).pathname.slice(-200),
        startMs: entry.startTime,
        durationMs: entry.duration,
      })),
  };
}

function workerPath(url: string) {
  try {
    return new URL(url).pathname.slice(-200);
  } catch {
    return url.split('?')[0].slice(-200);
  }
}

async function workerSnapshot(worker: Worker) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const probe = worker.evaluate(workerResources).then(
    (value) => ({ value }),
    (error: unknown) => ({ error: String(error).slice(0, 200) }),
  );
  const unavailable = new Promise<{ unavailable: true }>((resolve) => {
    timer = setTimeout(() => resolve({ unavailable: true }), 1000);
  });

  try {
    return { url: workerPath(worker.url()), ...(await Promise.race([probe, unavailable])) };
  } finally {
    clearTimeout(timer);
  }
}

export const browserWorkerDiagnostics = (page: Page) => Promise.all(page.workers().slice(0, 16).map(workerSnapshot));
