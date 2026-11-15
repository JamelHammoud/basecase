import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { workerCode } from './offscreenWorker.ts';

it('bundles an absolute module path into a standalone worker that returns results and errors', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'offscreen bundle '));
  const module = path.join(dir, 'render fixture.js');

  try {
    await writeFile(
      module,
      'export function capture(value) { if (value.fail) throw new Error("Render failed"); return value.width * value.height; }',
    );

    const code = await workerCode(module, 'capture');
    const replies = [];
    const worker = { postMessage: (reply) => replies.push(reply) };

    runInNewContext(code, { self: worker });
    await worker.onmessage({ data: { id: 1, payload: { width: 4, height: 3 } } });
    await worker.onmessage({ data: { id: 2, payload: { fail: true } } });
    expect(replies[0]).toEqual({ ready: true });
    expect(replies[1]).toEqual({ id: 1, result: 12 });
    expect(replies[2]).toEqual({ id: 2, error: expect.stringContaining('Render failed') });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
