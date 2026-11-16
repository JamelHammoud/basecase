import type { FacilityOptions, FacilitySummary, PreparedGeometry } from '../sites/facilityTypes';
import type { Registration } from '../sites/registration.mjs';

export interface FacilityResult {
  facility?: FacilitySummary;
  registration?: Registration | null;
  geometry: PreparedGeometry;
}

export function prepareFacilityRequest(
  request: { path: string; operation: 'import' | 'load'; files?: File[]; options?: FacilityOptions },
  signal: AbortSignal,
): Promise<FacilityResult> {
  const worker = new Worker(new URL('../sites/facilityBrowserWorker.ts', import.meta.url), { type: 'module' });

  return new Promise((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      reject(new Error('Fleet facility request refused'));
    };

    signal.addEventListener('abort', stop, { once: true });
    worker.onerror = stop;
    worker.onmessage = (event) => {
      worker.terminate();
      signal.removeEventListener('abort', stop);

      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.postMessage(request);
  });
}
