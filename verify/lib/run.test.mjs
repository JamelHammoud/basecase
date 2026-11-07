import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fail, pass } from './gate.mjs';
import { canaryOutcome, manifestDrift, ratchetProblems, runGate, saveResult } from './run.mjs';

const gate = (checks, canaries) => ({ id: 'g', title: 't', stage: 0, state: 'required', checks, canaries });
const named = (name, r) => ({ name, run: () => r });

describe('gatekeeper', () => {
  it('passes only when checks pass and canaries fire', async () => {
    const good = await runGate(gate([named('a', pass())], [named('c', fail('caught'))]));

    expect(good.ok).toBe(true);
    expect(good.voided).toBe(false);

    const badCheck = await runGate(gate([named('a', fail('no'))], [named('c', fail('caught'))]));

    expect(badCheck.ok).toBe(false);

    const silentCanary = await runGate(gate([named('a', pass())], [named('c', pass())]));

    expect(silentCanary.ok).toBe(false);
  });

  it('voids a gate with no canaries', async () => {
    expect((await runGate(gate([named('a', pass())], []))).voided).toBe('no canaries');
  });

  it('turns a throwing check into a failure', async () => {
    const r = await runGate(
      gate(
        [
          {
            name: 'boom',
            run: () => {
              throw new Error('nope');
            },
          },
        ],
        [named('c', fail('x'))],
      ),
    );

    expect(r.ok).toBe(false);
    expect(r.checks[0].detail).toContain('nope');
  });

  it('inverts canary results', () => {
    expect(canaryOutcome({ name: 'c', ok: false }).ok).toBe(true);
    expect(canaryOutcome({ name: 'c', ok: true }).ok).toBe(false);
  });

  it('reports gate files that changed, appeared or vanished', () => {
    expect(manifestDrift({ a: '1', b: '2' }, { a: '1', c: '3' })).toEqual(['b', 'c']);
    expect(manifestDrift({ a: '1' }, { a: '1' })).toEqual([]);
  });

  it('holds check counts at their floor', () => {
    expect(ratchetProblems({ g: 2 }, { g: 3 })).toEqual(['g: 2 checks, needs at least 3']);
    expect(ratchetProblems({ g: 3 }, { g: 3 })).toEqual([]);
  });

  it('records results with the commit', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-')), 'status.json');
    const status = saveResult({ id: 'g', ok: true, checks: [], canaries: [] }, file);

    expect(status.gates.g.ok).toBe(true);
    expect(status.gates.g.commit).toBeTruthy();
    expect(status.gates.g.at).toBeTruthy();
  });
});
