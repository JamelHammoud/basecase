import { evaluateContract, type ContractResult } from '../skills/contract';
import type { Contract } from './contract';

export type TraceDelta = Record<string, number[]>;

export interface GoalJudge {
  judge: (dt: number, delta: TraceDelta) => Promise<ContractResult | null>;
  dispose: () => void;
}

export function traceJudge(contract: Contract): GoalJudge {
  const signals: TraceDelta = {};

  return {
    judge(dt, delta) {
      for (const [name, values] of Object.entries(delta)) {
        const trace = signals[name] ?? [];

        trace.push(...values);
        signals[name] = trace;
      }

      return evaluateContract(contract, { dt, signals }).catch(() => null);
    },
    dispose: () => {},
  };
}

export type JudgeRequest = { contract: Contract } | { id: number; dt: number; delta: TraceDelta };

export interface JudgeReply {
  id: number;
  result: ContractResult | null;
}

export function workerJudge(contract: Contract): GoalJudge {
  const worker = new Worker(new URL('./goalJudge.worker.ts', import.meta.url), { type: 'module' });
  const waiting = new Map<number, (result: ContractResult | null) => void>();
  let calls = 0;
  let failed = false;

  const settleAll = () => {
    waiting.forEach((resolve) => resolve(null));
    waiting.clear();
  };

  worker.onmessage = (ev: MessageEvent<JudgeReply>) => {
    waiting.get(ev.data.id)?.(ev.data.result);
    waiting.delete(ev.data.id);
  };
  worker.onerror = () => {
    failed = true;
    settleAll();
  };
  worker.onmessageerror = settleAll;
  worker.postMessage({ contract } satisfies JudgeRequest);

  return {
    judge: (dt, delta) =>
      new Promise((resolve) => {
        if (failed) return resolve(null);

        const id = ++calls;

        waiting.set(id, resolve);
        worker.postMessage({ id, dt, delta } satisfies JudgeRequest);
      }),
    dispose() {
      worker.terminate();
      settleAll();
    },
  };
}
