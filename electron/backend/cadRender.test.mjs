import { describe, expect, it } from 'vitest';
import { renderCad } from './cadRender.mjs';
import { NO_KERNEL_ERROR } from './kernelRoutes.mjs';

const parsed = (bytes) => JSON.parse(Buffer.from(bytes).toString());

function recordingKernel(reply) {
  const jobs = [];

  return {
    jobs,
    render: async (job) => {
      jobs.push(job);

      return reply;
    },
  };
}

describe('renderCad', () => {
  it('answers with no kernel instead of compiling anywhere else', async () => {
    expect(parsed(await renderCad(undefined, { language: 'openscad', code: 'cube(1);' }))).toEqual({
      ok: false,
      error: NO_KERNEL_ERROR,
    });
  });

  it('refuses an unknown language, non-string code and oversized code before the kernel sees it', async () => {
    const kernel = recordingKernel(Buffer.from('{"ok":true}'));
    const refused = [
      { language: 'python', code: 'import os' },
      { language: 'openscad', code: { toString: () => 'cube(1);' } },
      { language: 'openscad', code: 'x'.repeat(200_001) },
      { language: ['openscad'], code: 'cube(1);' },
      null,
      'cube(1);',
    ];

    for (const payload of refused) expect(parsed(await renderCad(kernel, payload)).ok).toBe(false);

    expect(kernel.jobs).toEqual([]);
  });

  it('passes the sandbox reply bytes through unparsed with a fixed timeout and only the checked fields', async () => {
    const reply = Buffer.from('{"ok":true,"positions":[]}');
    const kernel = recordingKernel(reply);
    const out = await renderCad(kernel, { language: 'replicad', code: 'return 1;', timeoutMs: 1e9, expect: { x: 1 } });

    expect(out).toBe(reply);
    expect(kernel.jobs).toEqual([{ language: 'replicad', code: 'return 1;', timeoutMs: 90000 }]);
  });

  it('serialises an object reply and turns a thrown kernel error into a failure', async () => {
    expect(parsed(await renderCad(recordingKernel({ ok: true }), { language: 'openscad', code: '' }))).toEqual({
      ok: true,
    });

    const broken = { render: async () => Promise.reject(new Error('pool stopped')) };

    expect(parsed(await renderCad(broken, { language: 'openscad', code: 'cube(1);' }))).toEqual({
      ok: false,
      error: 'pool stopped',
    });
  });
});
