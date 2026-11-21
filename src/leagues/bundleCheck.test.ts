import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyLeagueBundle, type BundleCheckJob, type BundleCheckReply } from './bundleCheck';

class CheckWorker {
  static readonly instances: CheckWorker[] = [];
  onmessage: ((event: { data: BundleCheckReply }) => void) | null = null;

  onerror: (() => void) | null = null;

  postMessage = vi.fn();

  terminate = vi.fn();

  constructor() {
    CheckWorker.instances.push(this);
  }
}

const job = {} as BundleCheckJob;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('League bundle worker lifetime', () => {
  it('keeps verification outside the page and terminates after a refusal', async () => {
    vi.stubGlobal('Worker', CheckWorker);

    const checked = verifyLeagueBundle(job);
    const worker = CheckWorker.instances.at(-1)!;

    expect(worker.postMessage).toHaveBeenCalledWith(job);
    worker.onmessage?.({ data: { error: 'League bundle does not match' } });
    await expect(checked).rejects.toThrow('does not match');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('terminates an interrupted check without retrying it on the page', async () => {
    vi.stubGlobal('Worker', CheckWorker);
    vi.useFakeTimers();

    const checked = verifyLeagueBundle(job);
    const rejected = expect(checked).rejects.toThrow('robot check stopped');

    await vi.advanceTimersByTimeAsync(60000);
    await rejected;
    expect(CheckWorker.instances.at(-1)!.terminate).toHaveBeenCalledOnce();
    expect(CheckWorker.instances.at(-1)!.postMessage).toHaveBeenCalledOnce();
  });
});
