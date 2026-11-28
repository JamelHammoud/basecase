import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { expect, it, onTestFinished, vi } from 'vitest';
import { stubKitGuideWorker } from '../../e2e/kitGuideWorker';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

function workerBootstrap(source) {
  return `
    const { parentPort } = require('node:worker_threads');
    globalThis.self = globalThis;
    self.postMessage = (message) => parentPort.postMessage(message);
    self.fetch = async (url, request) => ({
      ok: true,
      json: async () => ({ url, job: JSON.parse(request.body) }),
    });
    parentPort.on('message', (data) => {
      if (data.release) self.resume();
      else self.onmessage?.({ data });
    });
    import(${JSON.stringify(moduleUrl(source))}).catch((error) => { throw error; });
  `;
}

function workerReplies(worker, count) {
  return new Promise((resolve, reject) => {
    const replies = [];
    const receive = (message) => {
      replies.push(message);

      if (replies.length !== count) return;

      worker.off('message', receive);
      worker.off('error', reject);
      resolve(replies);
    };

    worker.on('message', receive);
    worker.once('error', reject);
  });
}

it('loads the original guide natively and preserves queued steps, plans and the render override', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'guide-fixture-'));
  const resources = { worker: null };

  onTestFinished(async () => {
    try {
      await resources.worker?.terminate();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const original = path.join(directory, 'guide.worker-original.mjs');

  await writeFile(
    original,
    `self.postMessage({ loading: true });
     await new Promise((resolve) => { self.resume = resolve; });
     self.onmessage = ({ data }) => self.postMessage({ id: data.id, result: { op: data.op, payload: data.payload } });`,
  );

  const handlers = [];
  const page = {
    isClosed: () => false,
    context: () => ({ route: async (match, handler) => handlers.push({ match, handler }) }),
  };

  await stubKitGuideWorker(page);

  const sourceUrl = `${pathToFileURL(original).href}?worker_file&type=module`;
  const fulfill = vi.fn();
  const continueRequest = vi.fn();

  expect(handlers[0].match.test(sourceUrl)).toBe(true);
  await handlers[0].handler({ request: () => ({ url: () => sourceUrl }), fulfill });

  const wrapper = fulfill.mock.calls[0][0];

  expect(wrapper.contentType).toBe('text/javascript');
  await handlers[0].handler({
    request: () => ({ url: () => `${sourceUrl}&basecase-guide-original=1` }),
    continue: continueRequest,
  });
  expect(continueRequest).toHaveBeenCalledExactlyOnceWith();
  expect(fulfill).toHaveBeenCalledTimes(1);

  const worker = new Worker(workerBootstrap(wrapper.body), { eval: true });

  resources.worker = worker;

  expect(await once(worker, 'message')).toEqual([{ loading: true }]);

  const received = workerReplies(worker, 3);

  worker.postMessage({ id: 1, op: 'steps', payload: { parts: ['deck'] } });
  worker.postMessage({ id: 2, op: 'plan', payload: { title: 'Rover' } });
  worker.postMessage({ id: 3, op: 'render', payload: { job: { title: 'Rover' } } });
  worker.postMessage({ release: true });

  expect((await received).sort((left, right) => left.id - right.id)).toEqual([
    { id: 1, result: { op: 'steps', payload: { parts: ['deck'] } } },
    { id: 2, result: { op: 'plan', payload: { title: 'Rover' } } },
    { id: 3, result: { url: '/__kit-guide', job: { title: 'Rover' } } },
  ]);
});
