import { expect, it, vi } from 'vitest';
import { ImportActivation } from './importActivation';

it.each(['cancel', 'close', 'scene change'])('discards a late completion after %s', async () => {
  const activation = new ImportActivation();
  const install = vi.fn();
  let finish!: (value: string) => void;
  const response = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const active = activation.start();
  const work = response.then((value) => {
    if (active()) install(value);
  });

  activation.cancel();
  finish('archive');
  await work;
  expect(install).not.toHaveBeenCalled();
});

it('invalidates a superseded activation', () => {
  const activation = new ImportActivation();
  const first = activation.start();
  const second = activation.start();

  expect(first()).toBe(false);
  expect(second()).toBe(true);
});
