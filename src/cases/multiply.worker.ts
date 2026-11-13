/// <reference lib="webworker" />
import loadMujoco, { type MainModule } from '@mujoco/mujoco';
import { recordingTransfer } from '../sim/recorder';
import { multiplyBatch, type MultiplyJob } from './multiply';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let mj: Promise<MainModule> | null = null;
let job: MultiplyJob | null = null;

ctx.onmessage = async (ev: MessageEvent<{ job?: MultiplyJob; seeds: number[] }>) => {
  job = ev.data.job ?? job;

  try {
    mj ??= loadMujoco();

    const kept = await multiplyBatch(await mj, job!, ev.data.seeds);

    ctx.postMessage(
      { kept },
      kept.flatMap((v) => recordingTransfer(v.recording)),
    );
  } catch (e) {
    ctx.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
