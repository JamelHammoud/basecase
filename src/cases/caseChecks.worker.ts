/// <reference lib="webworker" />
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { runCaseCheckJob, type CaseCheckJob } from './caseCheckJob';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: Promise<MainModule> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function answer(id: number, job: CaseCheckJob) {
  try {
    mj ??= loadMujoco();
    ctx.postMessage({ id, reply: await runCaseCheckJob(await mj, job) });
  } catch (e) {
    ctx.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
}

ctx.onmessage = (ev: MessageEvent<{ id: number; job: CaseCheckJob }>) => {
  const { id, job } = ev.data;

  queue = queue.then(() => answer(id, job));
};
