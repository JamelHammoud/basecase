import { afterEach, describe, expect, it, vi } from 'vitest';
import { bodyClient, type BodyFitRequest } from './bodyClient';
import { fitBody } from './fitBody';

vi.mock('./fitBody', () => ({ fitBody: vi.fn(async () => ({ verdict: 'cant-tell' })) }));

const workers: BodyWorker[] = [];
const request = { robot: 'arm' } as BodyFitRequest;

class BodyWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  terminate = vi.fn();
  postMessage = vi.fn();

  constructor() {
    workers.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('body fitting worker', () => {
  it('refuses a missing browser worker without running the fitter on the page', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', undefined);

    const client = bodyClient();

    await expect(client.fit(request)).rejects.toThrow('Reload the app');
    expect(fitBody).not.toHaveBeenCalled();
    client.dispose();
  });

  it('terminates a failed browser worker without falling back to a page replay', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Worker', BodyWorker);

    const client = bodyClient();
    const waiting = client.fit(request);
    const worker = workers.at(-1)!;

    worker.onerror?.({ message: 'Worker failed' });
    await expect(waiting).rejects.toThrow('Reload the app');
    expect(fitBody).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
    client.dispose();
  });
});
