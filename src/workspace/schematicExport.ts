import { electricalClient } from '../wiring/electricalClient';
import { electricalSnapshot, electricalWalk } from '../wiring/electricalSnapshot';
import { freshWalk } from './storedWalk';
import type { WorkspaceCore } from './useWorkspaceCore';

export interface SchematicRun {
  signal: AbortSignal;
  current: () => WorkspaceCore;
}

export async function schematicExport(core: WorkspaceCore, run: SchematicRun) {
  const original = { parts: core.parts, project: core.project, id: core.scene.sceneId, name: core.scene.sceneName };
  const guard = () => {
    run.signal.throwIfAborted();

    const current = run.current();

    if (
      current.docs.partsRef.current !== original.parts ||
      current.docs.projectRef.current !== original.project ||
      current.scene.sceneId !== original.id ||
      current.scene.sceneName !== original.name
    )
      throw new Error('The scene changed during export. Export the schematic again.');
  };

  guard();
  ['schematic:snapshot', 'schematic:dispatch', 'schematic:prepare', 'schematic:delivery'].forEach((name) =>
    performance.clearMeasures(name),
  );

  const client = electricalClient();
  const stop = () => client.dispose();
  const start = performance.now();
  const walk = core.project.walk ? freshWalk(core.parts, core.project) : undefined;
  const input = { ...electricalSnapshot(core), walk: electricalWalk(walk) };

  performance.measure('schematic:snapshot', { start });
  run.signal.addEventListener('abort', stop, { once: true });

  try {
    const dispatchStart = performance.now();
    const pending = client.call('build', input);

    performance.measure('schematic:dispatch', { start: dispatchStart });

    const result = await pending;

    guard();
    performance.measure('schematic:prepare', { start });

    return result;
  } finally {
    run.signal.removeEventListener('abort', stop);
    client.dispose();
  }
}
