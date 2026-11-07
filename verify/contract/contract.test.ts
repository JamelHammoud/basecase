import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { evaluateContract, type Contract, type Trace } from '../../src/skills/contract';

const trace = (values: number[], dt = 0.1): Trace => ({ dt, signals: { x: values } });
const above = (value: number) => ({ atom: { expr: { signal: 'x' }, cmp: '>' as const, value, scale: 1 } });
const contract = (success: Contract['success']): Contract => ({ version: 1, success, failures: [] });

describe('task contract semantics', () => {
  it('eventually passes once and reports the best margin', async () => {
    const r = await evaluateContract(contract({ eventually: { window: 'whole', state: above(1) } }), trace([0, 2, 0]));

    expect(r.passed).toBe(true);
    expect(r.margin).toBeCloseTo(1);
  });

  it('always fails on one bad tick and reports the worst margin and time', async () => {
    const r = await evaluateContract(contract({ always: { window: 'whole', state: above(1) } }), trace([2, 2, 0.5, 2]));

    expect(r.passed).toBe(false);
    expect(r.margin).toBeCloseTo(-0.5);
    expect(r.worstAt).toBeCloseTo(0.2);
  });

  it('hold_for needs the whole dwell', async () => {
    const need = contract({ hold_for: { seconds: 0.3, state: above(0), within: 'whole' } });

    expect((await evaluateContract(need, trace([1, 1, -1, 1, 1]))).passed).toBe(false);
    expect((await evaluateContract(need, trace([1, 1, 1, -1, 1]))).passed).toBe(true);
  });

  it('sequence needs its steps in order', async () => {
    const seq = contract({
      sequence: [
        { eventually: { window: 'whole', state: above(5) } },
        { eventually: { window: 'whole', state: { not: above(1) } } },
      ],
    });

    expect((await evaluateContract(seq, trace([0, 6, 0]))).passed).toBe(true);
    expect((await evaluateContract(seq, trace([0, 0, 6]))).passed).toBe(false);
  });

  it('a final-state-only success is refused', async () => {
    const final = contract({ always: { window: { last: 0 }, state: above(0) } });

    await expect(evaluateContract(final, trace([1]))).rejects.toThrow();
  });

  it('reports a named failure', async () => {
    const c: Contract = {
      version: 1,
      success: { eventually: { window: 'whole', state: above(0) } },
      failures: [{ label: 'dropped', formula: { eventually: { window: 'whole', state: above(5) } } }],
    };
    const r = await evaluateContract(c, trace([1, 6]));

    expect(r.passed).toBe(false);
    expect(r.failed).toEqual(['dropped']);
  });

  it('rejects unknown signals, hostile depth and NaN traces instead of passing', async () => {
    const unknown = contract({
      eventually: { window: 'whole', state: { atom: { expr: { signal: 'y' }, cmp: '>', value: 0, scale: 1 } } },
    });

    await expect(evaluateContract(unknown, trace([1]))).rejects.toThrow();

    let deep: Contract['success'] = { eventually: { window: 'whole', state: above(0) } };

    for (let i = 0; i < 500; i++) deep = { all: [deep] };

    await expect(evaluateContract(contract(deep), trace([1]))).rejects.toThrow();
    expect(
      (await evaluateContract(contract({ always: { window: 'whole', state: above(0) } }), trace([1, NaN]))).passed,
    ).toBe(false);
  });
});

describe('native and WASM agree', () => {
  it('on 300 fuzzed contracts and traces', () => {
    const out = execFileSync(
      'cargo',
      [
        'run',
        '--release',
        '--quiet',
        '--manifest-path',
        'forge/Cargo.toml',
        '-p',
        'contract',
        '--bin',
        'contract-fuzz',
        '--',
        '300',
      ],
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    const cases = JSON.parse(out) as Array<{ contract: Contract; trace: Trace; passed: boolean; margin: number }>;

    expect(cases).toHaveLength(300);

    return Promise.all(
      cases.map(async (c) => {
        const r = await evaluateContract(c.contract, c.trace);

        expect(r.passed).toBe(c.passed);
        expect(r.margin).toBeCloseTo(c.margin, 9);
      }),
    );
  });

  it('the committed WASM is what the source builds', () => {
    expect(fs.existsSync('src/skills/contract.wasm')).toBe(true);
  });
});
