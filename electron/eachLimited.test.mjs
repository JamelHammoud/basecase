import { describe, expect, it, vi } from 'vitest';
import { eachLimited } from './eachLimited.mjs';

describe('fixed concurrent batches', () => {
  it.each([1, 4, 6])('claims work in order with a limit of %i despite out-of-order completion', async (limit) => {
    const items = Object.freeze(Array.from({ length: 17 }, (_, i) => ({ id: i })));
    const gates = items.map(() => Promise.withResolvers());
    const started = [];
    const completed = [];
    let active = 0;
    let peak = 0;
    const pending = eachLimited(items, limit, async (item, index) => {
      started.push(index);
      active++;
      peak = Math.max(peak, active);
      expect(item).toBe(items[index]);
      await gates[index].promise;
      completed.push(index);
      active--;
    });

    expect(started).toEqual(Array.from({ length: limit }, (_, i) => i));

    for (let count = 0; count < items.length; count++) {
      const index = started.findLast((i) => !completed.includes(i));

      gates[index].resolve();
      await gates[index].promise;
      await Promise.resolve();
    }

    await pending;
    expect(started).toEqual(items.map((item) => item.id));
    expect([...completed].sort((a, b) => a - b)).toEqual(started);
    expect(completed[0]).toBe(limit - 1);
    expect(peak).toBe(limit);
    expect(active).toBe(0);
  });

  it('handles empty and short batches and synchronous callbacks', async () => {
    const run = vi.fn();

    await eachLimited([], 6, run);
    expect(run).not.toHaveBeenCalled();
    await eachLimited([undefined, null, 0, false, ''], 6, run);
    expect(run.mock.calls).toEqual([
      [undefined, 0],
      [null, 1],
      [0, 2],
      [false, 3],
      ['', 4],
    ]);
  });

  it('rejects with the original failure while other workers finish their work', async () => {
    const gates = Array.from({ length: 5 }, () => Promise.withResolvers());
    const error = new Error('refused');
    const started = [];
    const finished = Promise.withResolvers();
    const pending = eachLimited([0, 1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      await gates[item].promise;

      if (item === 0) throw error;

      if (item === 4) finished.resolve();
    });
    const rejected = expect(pending).rejects.toBe(error);

    gates[0].resolve();
    await rejected;
    expect(started).toEqual([0, 1]);
    gates.forEach((gate) => gate.resolve());
    await finished.promise;
    expect(started).toEqual([0, 1, 2, 3, 4]);
  });

  it.each([300, 600])('reads each of %i source items once without copying or shifting the list', async (count) => {
    const items = Object.freeze(Array.from({ length: count }, (_, i) => i));
    let reads = 0;
    const source = new Proxy(items, {
      get(target, key, receiver) {
        if (key === Symbol.iterator || key === 'shift') throw new Error('The batch must retain its source list.');

        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;

        return Reflect.get(target, key, receiver);
      },
    });
    const visited = [];

    await eachLimited(source, 6, async (item, index) => {
      visited.push([item, index]);
    });
    expect(visited).toEqual(items.map((item, index) => [item, index]));
    expect(reads).toBe(count);
  });
});
