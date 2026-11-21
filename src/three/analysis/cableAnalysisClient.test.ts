import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { component, sceneOf } from '../../wiring/fixtures';
import { snapshotShapes } from './sceneShapes';
import { analysisHandlers, type AnalyzePayload } from './analysisOps';
import { cableAnalysisClient } from './cableAnalysisClient';

class AnalysisWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();
  messages: Array<{ id: number; payload: AnalyzePayload }> = [];
  postMessage(message: { id: number; payload: AnalyzePayload }) {
    this.messages.push(message);
  }
  async complete() {
    const message = this.messages.at(-1)!;
    const reply = await analysisHandlers.analyze(message.payload);

    this.onmessage?.({ data: { id: message.id, result: reply.result } } as MessageEvent);
  }
}

it('runs the existing production routing handler, reuses geometry and terminates cancelled analysis', async () => {
  const workers: AnalysisWorker[] = [];
  const client = cableAnalysisClient(() => {
    const worker = new AnalysisWorker();

    workers.push(worker);

    return worker as unknown as Worker;
  });
  const scene = sceneOf(
    [component('adapter', 'robotis-u2d2'), { ...component('servo', 'dynamixel-xl330-m288'), position: [70, 0, 0] }],
    [],
  );
  const object = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5));

  object.position.set(200, 200, 200);

  const shapes = snapshotShapes([{ id: 'obstacle', object }]);
  const first = client.run(shapes, scene, new AbortController().signal);

  await vi.waitFor(() => expect(workers[0].messages).toHaveLength(1));
  await workers[0].complete();
  expect((await first).buses[0].nets[0].route?.status).toBe('pass');
  expect(workers[0].messages[0].payload.geometries).toHaveLength(1);

  const abort = new AbortController();
  const second = client.run(shapes, scene, abort.signal);
  const rejected = expect(second).rejects.toMatchObject({ name: 'AbortError' });

  await vi.waitFor(() => expect(workers[0].messages).toHaveLength(2));
  expect(workers[0].messages[1].payload.geometries).toHaveLength(0);
  abort.abort();
  await rejected;
  expect(workers[0].terminate).toHaveBeenCalledOnce();

  const latest = client.run(shapes, scene, new AbortController().signal);

  await vi.waitFor(() => expect(workers[1].messages).toHaveLength(1));
  await workers[0].complete();
  await workers[1].complete();
  expect((await latest).buses[0].nets[0].route?.status).toBe('pass');
  client.dispose();
  object.geometry.dispose();
});
