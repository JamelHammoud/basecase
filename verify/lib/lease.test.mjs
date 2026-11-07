import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fail, pass } from './gate.mjs';
import { machineQuiet, takeLease, waitForQuiet } from './lease.mjs';
import { runGate } from './run.mjs';

const tempLease = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lease-')), 'lease');
const canary = { name: 'c', run: () => fail('caught') };
const gate = (checks) => ({ id: 'g', title: 't', stage: 0, state: 'required', checks, canaries: [canary] });

describe('gate lease', () => {
  it('holds the lease until released, then hands it on', async () => {
    const file = tempLease();
    const release = await takeLease({ file });

    expect(fs.readFileSync(file, 'utf8')).toBe(String(process.pid));

    release();

    expect(fs.existsSync(file)).toBe(false);

    const again = await takeLease({ file });

    again();
  });

  it('reclaims a lease whose holder has died', async () => {
    const file = tempLease();

    fs.writeFileSync(file, '999999999');

    const release = await takeLease({ file });

    expect(fs.readFileSync(file, 'utf8')).toBe(String(process.pid));

    release();
  });

  it('calls the machine busy above a third of its cores', () => {
    expect(machineQuiet(1, 16)).toBe(true);
    expect(machineQuiet(12, 16)).toBe(false);
  });

  it('gives up waiting for quiet at the deadline', async () => {
    const r = await waitForQuiet({ waitMs: 0, probe: () => false });

    expect(r.quiet).toBe(false);
  });

  it('voids a gate whose timed check never got a quiet machine', async () => {
    let ran = false;
    const timed = {
      name: 'fast',
      timed: true,
      run: () => {
        ran = true;

        return pass();
      },
    };
    const busy = () => Promise.resolve({ quiet: false, load: 20 });
    const r = await runGate(gate([timed]), () => {}, busy);

    expect(ran).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.voided).toBe('machine busy');
  });

  it('records the load a timed check ran under', async () => {
    const quiet = () => Promise.resolve({ quiet: true, load: 0.5 });
    const r = await runGate(gate([{ name: 'fast', timed: true, run: () => pass() }]), () => {}, quiet);

    expect(r.ok).toBe(true);
    expect(r.checks[0].metrics.loadBefore).toBe(0.5);
    expect(typeof r.checks[0].metrics.loadAfter).toBe('number');
  });
});
