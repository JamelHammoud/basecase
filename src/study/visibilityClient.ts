import { workerClient } from '../utils/workerRpc';
import type { VisibilityHandlers } from './visibilityHandlers';
import type { VisibilityLoad } from './visibilitySession';
import { StudyWireWriter } from './wire';
import type { StudyScene } from './types';

export function createVisibilitySession() {
  const writer = new StudyWireWriter();
  const client = workerClient<VisibilityHandlers>(
    () => new Worker(new URL('./visibility.worker.ts', import.meta.url), { type: 'module' }),
    async () => {
      throw new Error('Camera visibility needs a render worker. Run Study again.');
    },
  );

  return {
    load: (input: VisibilityLoad) => client.call('load', input, [input.bytes.buffer]),
    measure: (scene: StudyScene) =>
      client.call('measure', writer.write({ parts: scene.parts, project: scene.project, triangles: {}, measures: {} })),
    dispose: () => client.dispose(),
  };
}
