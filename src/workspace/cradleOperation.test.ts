import { expect, it, vi } from 'vitest';
import { cradleOperation } from './cradleOperation';
import type { CradleJob } from '../print/cradleJob';
import type { PreparedCradle } from '../print/cradleJob';
import { writeBoundCradle } from './cradlePrintSession';

const worker = vi.hoisted(() => ({ call: vi.fn(), dispose: vi.fn() }));

vi.mock('../three/geometryWorker', () => ({ isolatedGeometryWorker: () => worker }));

it('terminates cancelled work and refuses stale replies without restarting geometry', async () => {
  let finish: (value: unknown) => void = () => {};

  worker.call.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  worker.dispose.mockImplementation(() => finish(null));

  const controller = new AbortController();
  const pending = cradleOperation({ job: {} as CradleJob, signal: controller.signal, current: () => true });

  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(worker.call).toHaveBeenCalledTimes(1);
  expect(worker.dispose).toHaveBeenCalled();
  worker.call.mockResolvedValue({});
  await expect(
    cradleOperation({ job: {} as CradleJob, signal: new AbortController().signal, current: () => false }),
  ).rejects.toThrow('cradle:source');
});

it('refuses source replacement during archive writing before delivering any bytes', async () => {
  let current = true;

  worker.call.mockImplementation(async () => {
    current = false;

    return { files: { PLA: new Uint8Array([1]) } };
  });
  await expect(
    writeBoundCradle({
      prepared: {} as PreparedCradle,
      plates: { files: [], plateSize: [256, 256] },
      signal: new AbortController().signal,
      current: () => current,
    }),
  ).rejects.toThrow('cradle:source');
});
