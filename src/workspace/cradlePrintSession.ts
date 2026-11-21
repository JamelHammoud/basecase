import type { PreparedCradle } from '../print/cradleJob';
import type { PlateFiles } from './usePlateWriter';
import { isolatedGeometryWorker } from '../three/geometryWorker';
import { CradleError } from '../print/cradleTypes';

export async function writeBoundCradle(input: {
  prepared: PreparedCradle;
  plates: PlateFiles;
  signal: AbortSignal;
  current: () => boolean;
}) {
  input.signal.throwIfAborted();

  if (!input.current()) throw new CradleError('source');

  const client = isolatedGeometryWorker();
  const stop = () => client.dispose();
  const deadline = setTimeout(stop, 20_000);

  input.signal.addEventListener('abort', stop, { once: true });

  try {
    const result = await client.call('cradlePlate', { prepared: input.prepared, plates: input.plates });

    input.signal.throwIfAborted();

    if (!input.current()) throw new CradleError('source');

    return { files: result.files, labels: '' };
  } finally {
    clearTimeout(deadline);
    input.signal.removeEventListener('abort', stop);
    client.dispose();
  }
}
