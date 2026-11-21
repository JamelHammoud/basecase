import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { stubBracketStrength } from '../../e2e/strengthWorker';

class RpcWorker extends EventTarget {
  sent = [];
  replies = [];
  onmessage = (event) => this.replies.push(event.data);

  constructor() {
    super();
    this.addEventListener('message', (event) => this.onmessage(event));
  }

  postMessage(message, options) {
    this.sent.push({ message, options });
  }

  respond(id, reply) {
    this.dispatchEvent(new MessageEvent('message', { data: { id, ...reply } }));
  }
}

it('delivers orientation replies once through the RPC handler while preserving geometry, errors and other tasks', async () => {
  class Worker extends RpcWorker {}

  await stubBracketStrength({
    evaluate: (install, input) => runInNewContext(`(${install.toString()})(input)`, { Worker, MessageEvent, input }),
  });

  const worker = new Worker();
  const other = new Worker();
  const geometries = [{ id: 'geometry', positions: new Float32Array([0, 1, 2]), index: null }];
  const shapes = [{ key: 'shape', meshes: [] }];
  const transfer = [geometries[0].positions.buffer];
  const job = { key: 'shoulder|servo|l-bracket', part: 'l-bracket', down: [-1, 0, 0] };
  const request = (id, jobs) => ({
    id,
    op: 'analyze',
    payload: { geometries, shapes, task: { kind: 'strength', instances: [], jobs } },
  });
  const across = request(1, [job]);
  const side = request(2, [{ ...job, down: [0, 0, -1] }]);
  const measure = { id: 3, op: 'analyze', payload: { task: { kind: 'measure' } } };
  const unrelated = request(4, [{ ...job, part: 'other-part' }]);

  worker.postMessage(across, transfer);
  worker.postMessage(side, transfer);
  worker.postMessage(measure, transfer);
  worker.postMessage(unrelated, transfer);
  other.postMessage(across, transfer);
  worker.respond(2, { result: [] });
  worker.respond(3, { result: { volume: 12 } });
  worker.respond(1, { result: [] });
  worker.respond(4, { result: [null] });
  other.respond(1, { error: 'Geometry unavailable' });

  expect(worker.sent[0]).toMatchObject({
    message: { ...across, payload: { ...across.payload, task: { ...across.payload.task, jobs: [] } } },
    options: { transfer },
  });
  expect(worker.sent[2].message).toBe(measure);
  expect(worker.sent[3].message).toBe(unrelated);
  expect(worker.replies).toMatchObject([
    { id: 2, result: [{ key: job.key, part: job.part, factor: 3, down: [0, 0, -1] }] },
    { id: 3, result: { volume: 12 } },
    { id: 1, result: [{ key: job.key, part: job.part, factor: 1, best: { down: [0, 0, -1], factor: 3 } }] },
    { id: 4, result: [null] },
  ]);
  expect(other.replies).toEqual([{ id: 1, error: 'Geometry unavailable' }]);
  worker.respond(1, { result: 'not substituted twice' });
  expect(worker.replies.at(-1)).toEqual({ id: 1, result: 'not substituted twice' });
});
