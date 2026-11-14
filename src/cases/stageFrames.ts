import { evaluateContract, type Contract, type Formula, type Trace } from '../skills/contract';

const ticksOf = (trace: Trace) => Object.values(trace.signals).reduce((n, s) => Math.max(n, s.length), 0);

const prefix = (trace: Trace, ticks: number): Trace => ({
  dt: trace.dt,
  signals: Object.fromEntries(Object.entries(trace.signals).map(([k, s]) => [k, s.slice(0, ticks)])),
});

const stagesOf = (success: Formula): Formula[] => ('sequence' in success ? success.sequence : []);

const isEventually = (f: Formula) => 'eventually' in f || 'hold_for' in f;

async function reachedBy(contract: Contract, steps: Formula[], trace: Trace, ticks: number) {
  try {
    return (await evaluateContract({ ...contract, success: { sequence: steps }, failures: [] }, prefix(trace, ticks)))
      .passed;
  } catch {
    return false;
  }
}

async function firstReached(contract: Contract, steps: Formula[], trace: Trace): Promise<number | null> {
  let low = 1;
  let high = ticksOf(trace);

  if (!(await reachedBy(contract, steps, trace, high))) return null;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (await reachedBy(contract, steps, trace, mid)) high = mid;
    else low = mid + 1;
  }

  return low - 1;
}

export async function stageFrames(contract: Contract, trace: Trace): Promise<number[]> {
  const stages = stagesOf(contract.success);
  const frames: number[] = [];

  for (let k = 0; k < stages.length - 1; k++) {
    if (!isEventually(stages[k])) break;

    const frame = await firstReached(contract, stages.slice(0, k + 1), trace);

    if (frame === null) break;

    frames.push(frame);
  }

  return frames;
}
