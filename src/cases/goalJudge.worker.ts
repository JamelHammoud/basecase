/// <reference lib="webworker" />
import { traceJudge, type GoalJudge, type JudgeReply, type JudgeRequest } from './goalJudge';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let judge: GoalJudge | null = null;

ctx.onmessage = async (ev: MessageEvent<JudgeRequest>) => {
  const msg = ev.data;

  if ('contract' in msg) {
    judge = traceJudge(msg.contract);

    return;
  }

  const result = judge ? await judge.judge(msg.dt, msg.delta) : null;

  ctx.postMessage({ id: msg.id, result } satisfies JudgeReply);
};
