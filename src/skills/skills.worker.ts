/// <reference lib="webworker" />
import { type MainModule } from '@mujoco/mujoco';
import { loadMujoco } from '../sim/loadMujoco';
import type { ForgeJob, ForgeOutcome } from './forgeRunner';
import { runSkillsJob, type SkillsJob, type SkillsReply } from './skillsJob';
import { errorMessage } from '../utils/errorMessage';

export type SkillsRequest =
  | SkillsJob
  | { type: 'forge-result'; call: number; outcome: ForgeOutcome }
  | { type: 'save-result'; call: number; error: string | null };

export type SkillsMessage =
  | SkillsReply
  | { type: 'forge'; call: number; job: ForgeJob }
  | { type: 'save'; call: number; path: string; text: string }
  | { type: 'progress'; share: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const waiting = new Map<number, (value: SkillsRequest) => void>();
let calls = 0;
let mj: MainModule | null = null;

function ask(message: Extract<SkillsMessage, { call: number }>): Promise<SkillsRequest> {
  return new Promise((resolve) => {
    waiting.set(message.call, resolve);
    ctx.postMessage(message);
  });
}

const forge = async (job: ForgeJob): Promise<ForgeOutcome> => {
  const reply = await ask({ type: 'forge', call: ++calls, job });

  return (reply as Extract<SkillsRequest, { type: 'forge-result' }>).outcome;
};

const save = async (path: string, text: string) => {
  const reply = await ask({ type: 'save', call: ++calls, path, text });
  const error = (reply as Extract<SkillsRequest, { type: 'save-result' }>).error;

  if (error) throw new Error(error);
};

ctx.onmessage = async (ev: MessageEvent<SkillsRequest>) => {
  const msg = ev.data;

  if (msg.type === 'forge-result' || msg.type === 'save-result') {
    waiting.get(msg.call)?.(msg);
    waiting.delete(msg.call);

    return;
  }

  try {
    mj ??= await loadMujoco();

    const onProgress = (share: number) => ctx.postMessage({ type: 'progress', share } satisfies SkillsMessage);

    ctx.postMessage(await runSkillsJob(msg, { mj, forge, save, onProgress }));
  } catch (e) {
    ctx.postMessage({ type: 'error', message: errorMessage(e) } satisfies SkillsMessage);
  }
};
