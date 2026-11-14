import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CaseMat } from '../../cases/mat/matLayout';
import type { MatSample } from './matTracker';
import {
  claimMatTracking,
  closeMatTracking,
  feedMatFrames,
  matTrackingSnapshot,
  onMatSample,
  openMatTracking,
} from './matTracking';
import type { MatFeed, TagsEvent, TagsRequest } from './tagsProtocol';

const workers: FakeWorker[] = [];

class FakeWorker {
  onmessage: ((ev: { data: TagsEvent }) => void) | null = null;
  onerror: ((ev: { message: string }) => void) | null = null;
  terminated = false;

  constructor() {
    workers.push(this);
  }

  postMessage(request: TagsRequest) {
    if (request.type === 'open') queueMicrotask(() => this.onmessage?.({ data: { type: 'ready' } }));
  }

  terminate() {
    this.terminated = true;
  }

  emit(event: TagsEvent) {
    this.onmessage?.({ data: event });
  }
}

const MAT = {} as CaseMat;
const FEED = { poses: [] } as unknown as MatFeed;
const sample = (t: number): MatSample => ({ t, base: null, tags: 0 }) as unknown as MatSample;

async function openStandIn() {
  const owner = claimMatTracking();

  feedMatFrames(FEED);

  return { owner, refusal: await openMatTracking(owner, MAT) };
}

describe('mat tracking sessions', () => {
  vi.stubGlobal('Worker', FakeWorker);

  afterEach(() => closeMatTracking(matTrackingSnapshot().owner));

  it('lets one try hold tracking, and only that try close it or read its samples', async () => {
    const { owner, refusal } = await openStandIn();
    const worker = workers.at(-1);
    const mine: number[] = [];
    const theirs: number[] = [];

    expect(refusal).toBeNull();
    expect(matTrackingSnapshot()).toMatchObject({ owner, open: true });
    expect(claimMatTracking()).toBe(0);
    expect(await openMatTracking(owner + 1, MAT)).toBeNull();

    const stopMine = onMatSample(owner, (s) => mine.push(s.t));
    const stopTheirs = onMatSample(owner + 1, (s) => theirs.push(s.t));

    worker?.emit({ type: 'sample', sample: sample(0.5) });
    closeMatTracking(owner + 1);
    worker?.emit({ type: 'sample', sample: sample(0.6) });

    expect(mine).toEqual([0.5, 0.6]);
    expect(theirs).toEqual([]);
    expect(worker?.terminated).toBe(false);

    closeMatTracking(owner);
    stopMine();
    stopTheirs();

    expect(worker?.terminated).toBe(true);
    expect(matTrackingSnapshot()).toMatchObject({ owner: 0, open: false });
  });

  it('frees tracking for the next try once closed, and drops the old worker', async () => {
    const first = await openStandIn();
    const old = workers.at(-1);

    closeMatTracking(first.owner);

    const second = await openStandIn();
    const heard: number[] = [];
    const stop = onMatSample(second.owner, (s) => heard.push(s.t));

    old?.emit({ type: 'sample', sample: sample(1) });
    workers.at(-1)?.emit({ type: 'sample', sample: sample(2) });
    stop();

    expect(second.owner).toBeGreaterThan(first.owner);
    expect(heard).toEqual([2]);
  });
});
