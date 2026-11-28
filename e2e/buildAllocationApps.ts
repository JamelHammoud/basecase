import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openApp, type App } from './harness';

export function buildAllocationApps(count: number, open: () => Promise<App> = openApp) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'build-allocation-'));
  const opening = Array.from({ length: count }, () => Promise.resolve().then(open));
  let closing: Promise<void> | undefined;
  let setupFailed = false;
  const release = async () => {
    const started = await Promise.allSettled(opening);

    try {
      const closed = await Promise.allSettled(
        started.flatMap((result) =>
          result.status === 'fulfilled' ? [Promise.resolve().then(() => result.value.close())] : [],
        ),
      );
      const errors = closed.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));

      if (errors.length && !setupFailed) throw new AggregateError(errors, 'Allocation browser cleanup failed.');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
  const close = () => (closing ??= release());
  const ready = Promise.all(opening)
    .then((apps) => {
      if (closing) throw new Error('Allocation browser setup was closed.');

      return apps;
    })
    .catch(async (error: unknown) => {
      setupFailed = true;
      await close().catch(() => undefined);

      throw error;
    });

  return { directory, ready, close };
}
