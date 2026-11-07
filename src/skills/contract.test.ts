import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contractSignals, evaluateContract, type Contract, type State } from './contract';

const above = (value: number): State => ({ atom: { expr: { signal: 'x' }, cmp: '>', value, scale: 1 } });
const eventually: Contract = {
  version: 1,
  success: { eventually: { window: 'whole', state: above(0) } },
  failures: [],
};

describe('the contract WASM', () => {
  it('ships small and holds no machine paths', () => {
    const bytes = fs.readFileSync(new URL('./contract.wasm', import.meta.url));

    expect(bytes.length).toBeLessThan(200 * 1024);
    expect(bytes.includes('/Users/')).toBe(false);
    expect(bytes.includes('worktrees')).toBe(false);
  });

  it('loads once and evaluates many times without leaking the first reply into the next', async () => {
    for (let i = 0; i < 50; i++) {
      const r = await evaluateContract(eventually, { dt: 0.1, signals: { x: [i - 25, i - 25] } });

      expect(r.passed).toBe(i > 25);
      expect(r.margin).toBeCloseTo(i - 25);
    }
  });

  it('turns an infinity in a trace into a failure, not a pass', async () => {
    const r = await evaluateContract(
      { ...eventually, success: { always: { window: 'whole', state: above(0) } } },
      { dt: 0.1, signals: { x: [1, Infinity] } },
    );

    expect(r.passed).toBe(false);
    expect(r.margin).toBe(-Infinity);
  });

  it('refuses a NaN parameter even though JSON would hide it', async () => {
    const bad: Contract = {
      ...eventually,
      success: { eventually: { window: 'whole', state: above(NaN) } },
    };

    await expect(evaluateContract(bad, { dt: 0.1, signals: { x: [1, 1] } })).rejects.toThrow(/finite/);
  });

  it('handles labels and signal names outside ASCII', async () => {
    const c: Contract = {
      version: 1,
      success: {
        eventually: { window: 'whole', state: { atom: { expr: { signal: 'höhe' }, cmp: '>', value: 0, scale: 1 } } },
      },
      failures: [{ label: 'fällt "um" 🤖', formula: { eventually: { window: 'whole', state: above(5) } } }],
    };
    const r = await evaluateContract(c, { dt: 0.1, signals: { höhe: [1, 1], x: [6, 6] } });

    expect(r.failed).toEqual(['fällt "um" 🤖']);
  });

  it('lists the signals a contract reads', async () => {
    const c: Contract = {
      version: 1,
      success: {
        always: {
          window: 'whole',
          state: {
            atom: {
              expr: {
                dist: [
                  ['a', 'b', 'c'],
                  ['d', 'e', 'f'],
                ],
              },
              cmp: '<',
              value: 1,
              scale: 1,
            },
          },
        },
      },
      failures: [{ label: 'x', formula: { eventually: { window: 'whole', state: above(0) } } }],
    };

    expect(await contractSignals(c)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'x']);
    await expect(contractSignals({ version: 2 } as unknown as Contract)).rejects.toThrow();
  });
});
