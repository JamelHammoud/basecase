/// <reference lib="webworker" />
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { CaseCheckSession, replyTransfer, type CaseCheckJob } from './caseCheckJob';
import { errorMessage } from '../utils/errorMessage';
import { keepPieces } from './worldPieces';
import type { WorldPiece } from './worldTypes';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: Promise<MainModule> | null = null;
const session = new CaseCheckSession();
let queue: Promise<unknown> = Promise.resolve();

async function answer(id: number, job: CaseCheckJob) {
  try {
    mj ??= loadMujoco();

    const reply = await session.run(await mj, job);

    ctx.postMessage({ id, reply }, replyTransfer(reply));
  } catch (e) {
    ctx.postMessage({ id, error: errorMessage(e) });
  }
}

ctx.onmessage = (ev: MessageEvent<{ id: number; job: CaseCheckJob; pieces?: Record<string, WorldPiece[]> }>) => {
  const { id, job, pieces } = ev.data;

  Object.entries(pieces ?? {}).forEach(([hash, kept]) => keepPieces(hash, kept));

  queue = queue.then(() => answer(id, job));
};
