import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportStepFile, NO_STEP_KERNEL_ERROR } from './stepExport.mjs';
import { checkedStepJob } from './stepPolicy.mjs';

const PLACE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const STEP = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n';
const body = (extra = {}) => ({
  name: 'Plate',
  color: '#336699',
  place: PLACE,
  solid: { type: 'box', size: [1, 2, 3] },
  ...extra,
});
const job = (bodies = [body()]) => ({ name: 'Scene', bodies });

function replying(reply) {
  const jobs = [];

  return { jobs, kernel: { exportStep: async (j) => (jobs.push(j), reply) } };
}

const nested = (depth) =>
  Array.from({ length: depth }).reduce((solid) => ({ type: 'moved', matrix: PLACE, solid }), {
    type: 'box',
    size: [1, 1, 1],
  });

describe('STEP export policy', () => {
  it('hands the export only to the sandboxed kernel, and never builds it in this process', async () => {
    const { jobs, kernel } = replying({ ok: true, step: STEP, skipped: 0 });

    await expect(exportStepFile(kernel, job())).resolves.toEqual({ step: STEP, skipped: 0 });
    expect(jobs[0].bodies[0]).toMatchObject({ name: 'Plate', solid: { type: 'box', size: [1, 2, 3] } });
    await expect(exportStepFile(null, job())).rejects.toThrow(NO_STEP_KERNEL_ERROR);
    await expect(exportStepFile({ render: () => {} }, job())).rejects.toThrow(NO_STEP_KERNEL_ERROR);

    const entry = fs.readFileSync(path.join('electron', 'cad-kernel', 'stepExport.mjs'), 'utf8');

    expect(entry).not.toMatch(/nodeHost|stepAssembly|replicad|occt/);
  });

  it('drops a forged kernel reply', async () => {
    const forged = [
      { ok: true, step: 'solid evil\nendsolid', skipped: 0 },
      { ok: true, step: 'ISO-10303-21;\nDATA;\n#1=X();', skipped: 0 },
      { ok: true, step: STEP, skipped: 2 },
      { ok: true, step: STEP, skipped: -1 },
      { ok: true, step: STEP, skipped: 0.5 },
      { ok: true, step: { toString: () => STEP }, skipped: 0 },
      new TextEncoder().encode('{"ok": tru'),
    ];

    for (const reply of forged)
      await expect(exportStepFile(replying(reply).kernel, job())).rejects.toThrow('malformed');

    await expect(exportStepFile(replying({ ok: false, error: 'stopped' }).kernel, job())).rejects.toThrow('stopped');

    const bytes = new TextEncoder().encode(JSON.stringify({ ok: true, step: STEP, skipped: 1 }));

    await expect(exportStepFile(replying(bytes).kernel, job())).resolves.toEqual({ step: STEP, skipped: 1 });
  });

  it('refuses a job it cannot hand over safely', () => {
    const bad = [
      job([]),
      job(Array.from({ length: 2001 }, () => body())),
      job([body({ color: 'red; url(x)' })]),
      job([body({ name: 'x'.repeat(201) })]),
      job([body({ name: 42 })]),
      job([body({ place: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0] })]),
      job([body({ place: [1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0] })]),
      job([body({ place: [...PLACE.slice(0, 11), Number.NaN] })]),
      job([body({ solid: { type: 'mesh', positions: [0, 0, 0, 1, 0, 0, 0, 1] } })]),
      job([body({ solid: { type: 'mesh', positions: [0, 0, 0, 1, 0, 0, 0, 1, Number.POSITIVE_INFINITY] } })]),
      job([body({ solid: { type: 'box', size: [1, 0, 1] } })]),
      job([body({ solid: { type: 'script', code: 'x' } })]),
      job([body({ solid: { type: 'code', code: 'x'.repeat(400_001) } })]),
      job([body({ solid: { type: 'boolean', op: 'xor', solids: [nested(0), nested(0)] } })]),
      job([body({ solid: nested(20) })]),
      { name: '../../evil', bodies: 'all' },
    ];

    for (const payload of bad) expect(() => checkedStepJob(payload), JSON.stringify(payload).slice(0, 80)).toThrow();

    expect(checkedStepJob(job([body({ solid: nested(10) })])).bodies).toHaveLength(1);
  });
});
