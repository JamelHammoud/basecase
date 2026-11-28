import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { buildAllocationApps } from '../../e2e/buildAllocationApps';

it.each(['before', 'after'])('closes a sibling that opens %s another allocation browser fails', async (order) => {
  let accept;
  let refuse;
  const closing = vi.fn().mockResolvedValue(undefined);
  const open = vi
    .fn()
    .mockImplementationOnce(() => new Promise((resolve) => (accept = resolve)))
    .mockImplementationOnce(() => new Promise((_resolve, reject) => (refuse = reject)));
  const group = buildAllocationApps(2, open);
  const failure = new Error('Studio setup failed.');
  const rejected = expect(group.ready).rejects.toBe(failure);

  await Promise.resolve();
  expect(open).toHaveBeenCalledTimes(2);

  if (order === 'before') accept({ close: closing });

  refuse(failure);
  await Promise.resolve();

  if (order === 'after') accept({ close: closing });

  await rejected;
  await group.close();
  expect(closing).toHaveBeenCalledOnce();
  expect(fs.existsSync(group.directory)).toBe(false);
});

it.each(['throws', 'rejects'])('closes every context and removes purchases when cleanup %s', async (mode) => {
  const failure = new Error('Chrome closure failed.');
  const first = vi.fn(() => {
    if (mode === 'throws') throw failure;

    return Promise.reject(failure);
  });
  const second = vi.fn().mockResolvedValue(undefined);
  const open = vi.fn().mockResolvedValueOnce({ close: first }).mockResolvedValueOnce({ close: second });
  const group = buildAllocationApps(2, open);

  await group.ready;
  fs.writeFileSync(path.join(group.directory, 'purchases.json'), '{}');
  await expect(group.close()).rejects.toThrow('Allocation browser cleanup failed.');
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledOnce();
  expect(fs.existsSync(group.directory)).toBe(false);
});

it('preserves the startup error when sibling cleanup also fails', async () => {
  const failure = new Error('Studio startup failed.');
  const close = vi.fn().mockRejectedValue(new Error('Chrome closure failed.'));
  const open = vi.fn().mockResolvedValueOnce({ close }).mockRejectedValueOnce(failure);
  const group = buildAllocationApps(2, open);

  await expect(group.ready).rejects.toBe(failure);
  await group.close();
  expect(close).toHaveBeenCalledOnce();
  expect(fs.existsSync(group.directory)).toBe(false);
});

it('retires late startup after test teardown without returning an app to the expired callback', async () => {
  let finish;
  const close = vi.fn().mockResolvedValue(undefined);
  const open = () => new Promise((resolve) => (finish = resolve));
  const group = buildAllocationApps(1, open);
  const rejected = expect(group.ready).rejects.toThrow('Allocation browser setup was closed.');
  const cleanup = group.close();

  await Promise.resolve();
  finish({ close });
  await cleanup;
  await rejected;
  expect(close).toHaveBeenCalledOnce();
  expect(fs.existsSync(group.directory)).toBe(false);
});
