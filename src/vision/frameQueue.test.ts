import { MessageChannel } from 'node:worker_threads';
import { expect, it, vi } from 'vitest';
import { LatestFrameQueue } from './frameQueue';

it('keeps only the newest pending frame per camera and closes every owned frame', async () => {
  let finish: (() => void) | undefined;
  const seen: number[] = [];
  const run = async (job: { id: number; modelId: string; camera?: string; frame: { close(): void } }) => {
    seen.push(job.id);

    if (job.id === 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  };
  const queue = new LatestFrameQueue(run);
  const frames = [1, 2, 3, 4].map((id) => ({ id, modelId: 'test', camera: 'scene', frame: { close: vi.fn() } }));

  frames.forEach((frame) => queue.push(frame));
  expect(frames[1].frame.close).toHaveBeenCalledOnce();
  expect(frames[2].frame.close).toHaveBeenCalledOnce();
  finish!();
  await vi.waitFor(() => expect(seen).toEqual([1, 4]));
  queue.close();
  expect(frames[0].frame.close).toHaveBeenCalledOnce();
  expect(frames[3].frame.close).toHaveBeenCalledOnce();
});

it('bounds camera keys and closes replaced frames once even when the pending map is full', async () => {
  let finish: (() => void) | undefined;
  const active = { modelId: 'test', camera: 'active', frame: { close: vi.fn() } };
  const queue = new LatestFrameQueue<typeof active>(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });

  queue.push(active);

  const jobs = Array.from({ length: 32 }, (_, i) => ({
    modelId: 'test',
    camera: String(i),
    frame: { close: vi.fn() },
  }));

  jobs.forEach((job) => queue.push(job));
  queue.push({ ...jobs[0], frame: { close: vi.fn() } });
  expect(jobs[0].frame.close).toHaveBeenCalledOnce();
  expect(jobs[1].frame.close).not.toHaveBeenCalled();
  queue.push({ modelId: 'test', camera: 'extra', frame: { close: vi.fn() } });
  expect(jobs[1].frame.close).toHaveBeenCalledOnce();
  queue.close();
  finish!();
  await vi.waitFor(() => expect(active.frame.close).toHaveBeenCalledOnce());
});

it('keeps producers independent when they request the same camera and model', async () => {
  let finish: (() => void) | undefined;
  const seen: number[] = [];
  const producerA = {};
  const producerB = {};
  const job = (id: number, producer: object) => ({
    id,
    producer,
    modelId: 'test',
    camera: 'scene',
    frame: { close: vi.fn() },
  });
  const dropped = vi.fn();
  const queue = new LatestFrameQueue(async (item: ReturnType<typeof job>) => {
    seen.push(item.id);

    if (item.id === 0)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  }, dropped);
  const active = job(0, producerA);
  const olderA = job(1, producerA);
  const queuedB = job(2, producerB);
  const newestA = job(3, producerA);

  [active, olderA, queuedB, newestA].forEach((item) => queue.push(item));
  expect(dropped).toHaveBeenCalledExactlyOnceWith(olderA);
  expect(olderA.frame.close).toHaveBeenCalledOnce();
  expect(queuedB.frame.close).not.toHaveBeenCalled();
  finish!();
  await vi.waitFor(() => expect(seen).toEqual([0, 2, 3]));
  queue.close();
  expect(queuedB.frame.close).toHaveBeenCalledOnce();
  expect(newestA.frame.close).toHaveBeenCalledOnce();
});

it('acknowledges capacity eviction, detach, close and incoming frames after close', async () => {
  let finish: (() => void) | undefined;
  const channel = new MessageChannel();
  const received = vi.fn();
  const producer = channel.port2;
  const job = (camera: string) => ({ producer, modelId: 'test', camera, frame: { close: vi.fn() } });
  const queue = new LatestFrameQueue(
    async (_item: ReturnType<typeof job>) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    (item) => item.producer.postMessage({ type: 'dropped', dropped: true, camera: item.camera, modelId: item.modelId }),
  );

  channel.port1.on('message', received);
  queue.push(job('active'));

  const jobs = Array.from({ length: 33 }, (_, i) => job(String(i)));

  jobs.forEach((item) => queue.push(item));
  await vi.waitFor(() =>
    expect(received).toHaveBeenCalledWith({ type: 'dropped', dropped: true, camera: '0', modelId: 'test' }),
  );
  expect(jobs[0].frame.close).toHaveBeenCalledOnce();
  queue.removeProducer(producer);
  await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(33));

  const closed = job('closed');

  queue.push(closed);
  queue.close();
  await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(34));
  expect(closed.frame.close).toHaveBeenCalledOnce();

  const later = job('later');

  queue.push(later);
  await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(35));
  expect(later.frame.close).toHaveBeenCalledOnce();
  finish!();
  channel.port1.close();
  channel.port2.close();
});
