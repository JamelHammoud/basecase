import type { SupplierOffer } from '../types/purchasing';

export function importOffersAsync(text: string, source: string, signal: AbortSignal): Promise<SupplierOffer[]> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));

  const worker = new Worker(new URL('./supplierOfferImport.worker.ts', import.meta.url), { type: 'module' });

  return new Promise((resolve, reject) => {
    const dispose = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      dispose();
      reject(new DOMException('Cancelled', 'AbortError'));
    };

    worker.onmessage = ({ data }: MessageEvent<{ offers?: SupplierOffer[]; error?: string }>) => {
      dispose();

      if (data.offers) resolve(data.offers);
      else reject(new Error(data.error));
    };
    worker.onerror = (event) => {
      dispose();
      reject(new Error(event.message));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.postMessage({ text, source });
  });
}
