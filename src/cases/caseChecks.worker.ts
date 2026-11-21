/// <reference lib="webworker" />
import type { MainModule } from '@mujoco/mujoco';
import { CaseCheckSession, replyTransfer, workbenchIdentityReply, type CaseCheckJob } from './caseCheckJob';
import { loadMujoco } from '../sim/loadMujoco';
import { errorMessage } from '../utils/errorMessage';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: Promise<MainModule> | null = null;
const session = new CaseCheckSession();
let queue: Promise<unknown> = Promise.resolve();

async function jobReply(job: CaseCheckJob) {
  const identity = workbenchIdentityReply(job);

  if (identity) return identity;

  mj ??= loadMujoco();

  return session.run(await mj, job);
}

async function answer(id: number, job: CaseCheckJob) {
  try {
    const reply = await jobReply(job);

    ctx.postMessage({ id, reply }, replyTransfer(reply));
  } catch (e) {
    ctx.postMessage({ id, error: errorMessage(e) });
  }
}

ctx.onmessage = (ev: MessageEvent<{ id: number; job: CaseCheckJob }>) => {
  const { id, job } = ev.data;

  queue = queue.then(() => answer(id, job));
};
