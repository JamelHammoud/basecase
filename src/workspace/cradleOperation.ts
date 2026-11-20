import { isolatedGeometryWorker } from '../three/geometryWorker';
import type { CradleJob } from '../print/cradleJob';
import { CradleError } from '../print/cradleTypes';

interface CradleOperation {
  job: CradleJob;
  signal: AbortSignal;
  current: () => boolean;
}

export async function cradleOperation({ job, signal, current }: CradleOperation) {
  signal.throwIfAborted();

  if (!current()) throw new CradleError('source');

  const client = isolatedGeometryWorker();
  let cancellationStarted: number | null = null;
  const stop = () => {
    cancellationStarted = performance.now();

    client.dispose();
  };
  const deadline = setTimeout(stop, 20_000);

  signal.addEventListener('abort', stop, { once: true });

  try {
    const result = await client.call('cradlePrepare', job);

    signal.throwIfAborted();

    if (!current()) throw new CradleError('source');

    return result;
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener('abort', stop);
    client.dispose();

    if (cancellationStarted !== null) {
      performance.clearMeasures('cradle:cancel');
      performance.measure('cradle:cancel', { start: cancellationStarted });
    }
  }
}
