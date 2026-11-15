import { describe, expect, it, vi } from 'vitest';
import { createLabelTasks } from './labelTasks';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe('label editor async tasks', () => {
  it('discards an operation after closing the editor and serializes overlapping requests', async () => {
    const tasks = createLabelTasks();
    const pending = deferred<string>();
    const apply = vi.fn();
    const busy = vi.fn();
    const error = vi.fn();
    const first = tasks.run({ task: () => pending.promise, apply, busy, error });
    const duplicate = vi.fn(async () => 'duplicate');

    await tasks.run({ task: duplicate, apply, busy, error });
    expect(duplicate).not.toHaveBeenCalled();
    tasks.close();
    pending.resolve('stale labels');
    await first;
    expect(apply).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps results from an earlier lifetime out of a reopened editor', async () => {
    const tasks = createLabelTasks();
    const pending = deferred<string>();
    const apply = vi.fn();
    const busy = vi.fn();
    const error = vi.fn();
    const first = tasks.run({ task: () => pending.promise, apply, busy, error });

    tasks.close();
    tasks.open();
    await tasks.run({ task: async () => 'current labels', apply, busy, error });
    pending.resolve('stale labels');
    await first;
    expect(apply.mock.calls).toEqual([['current labels']]);
    expect(busy.mock.calls).toEqual([[true], [true], [false]]);
  });
});
