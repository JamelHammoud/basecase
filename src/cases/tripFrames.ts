import { evaluateContract, type Contract, type Trace } from '../skills/contract';

export interface Trip {
  label: string;
  frame: number;
}

const ticksOf = (trace: Trace) => Object.values(trace.signals).reduce((n, s) => Math.max(n, s.length), 0);

const prefix = (trace: Trace, ticks: number): Trace => ({
  dt: trace.dt,
  signals: Object.fromEntries(Object.entries(trace.signals).map(([k, s]) => [k, s.slice(0, ticks)])),
});

async function firesBy(contract: Contract, trace: Trace, label: string, frame: number) {
  const only = { ...contract, failures: contract.failures.filter((f) => f.label === label) };

  try {
    return (await evaluateContract(only, prefix(trace, frame + 1))).failed.includes(label);
  } catch {
    return false;
  }
}

async function firstTrip(contract: Contract, trace: Trace, label: string): Promise<number> {
  let low = 0;
  let high = ticksOf(trace) - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (await firesBy(contract, trace, label, mid)) high = mid;
    else low = mid + 1;
  }

  return low;
}

export async function tripFrames(contract: Contract, trace: Trace): Promise<Trip[]> {
  const { failed } = await evaluateContract(contract, trace);
  const trips: Trip[] = [];

  for (const label of failed) trips.push({ label, frame: await firstTrip(contract, trace, label) });

  return trips;
}
