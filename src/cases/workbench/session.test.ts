import { expect, it } from 'vitest';
import { CaseCheckPool, type WorkerLike } from '../caseChecksClient';
import type { WorkbenchJob } from '../caseCheckJob';
import type { WorkbenchResult } from './rehearsal';
import { WorkbenchSession } from './session';

it('cancels preparation and running workers without accepting stale results or changing prior evidence', async () => {
  let complete: (job: WorkbenchJob) => void = () => {};
  let accepted = 0;
  let terminated = 0;
  const messages: Array<{ id: number; job: WorkbenchJob }> = [];
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (message) => messages.push(message as (typeof messages)[number]),
    terminate: () => {
      terminated++;
    },
  };
  const session = new WorkbenchSession(() => new CaseCheckPool(() => worker));
  const accept = async () => {
    accepted++;
  };
  const preparing = session.run(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    accept,
  );

  session.cancel();
  complete({ type: 'workbench' } as WorkbenchJob);
  await preparing;
  expect(messages).toHaveLength(0);

  const running = session.run(async () => ({ type: 'workbench' }) as WorkbenchJob, accept);

  await Promise.resolve();
  expect(messages).toHaveLength(1);
  session.cancel();
  await expect(running).rejects.toThrow('Canceled');
  worker.onmessage?.({
    data: { id: messages[0].id, reply: { type: 'workbench', result: {} as WorkbenchResult } },
  } as MessageEvent);
  expect(accepted).toBe(0);
  expect(terminated).toBe(1);
});
