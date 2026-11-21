import { describe, expect, it } from 'vitest';
import { sketchSupportQueue } from './sketchSupportQueue';

function pendingRun() {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });

  return { promise, finish };
}

describe('Sketch regeneration queue', () => {
  it('retains one active request and only the newest intervening scene state', async () => {
    const active = pendingRun();
    const calls: number[] = [];
    const queue = sketchSupportQueue(async (value: number) => {
      calls.push(value);

      if (value === 1) await active.promise;
    });

    queue.submit(1);
    queue.submit(2);
    queue.submit(3);
    expect(calls).toEqual([1]);
    active.finish();
    await active.promise;
    await Promise.resolve();
    expect(calls).toEqual([1, 3]);
  });

  it('drops retained pending input when the workspace closes', async () => {
    const active = pendingRun();
    const calls: number[] = [];
    const queue = sketchSupportQueue(async (value: number) => {
      calls.push(value);
      await active.promise;
    });

    queue.submit(1);
    queue.submit(2);
    queue.dispose();
    active.finish();
    await active.promise;
    await Promise.resolve();
    queue.submit(3);
    expect(calls).toEqual([1]);
  });
});
