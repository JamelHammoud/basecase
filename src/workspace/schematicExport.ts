import type { KitElectrical } from '../kit/electrical';
import type { SchematicResult } from '../wiring/electricalClient';
import type { BoardNativeResult } from '../wiring/boardRoutingTypes';
import { validateNativeBoard } from '../wiring/boardNativeClient';
import { electricalClient } from '../wiring/electricalClient';
import { electricalSnapshot, electricalWalk } from '../wiring/electricalSnapshot';
import { freshWalk } from './storedWalk';
import type { WorkspaceCore } from './useWorkspaceCore';
import { sourcedMeshFiles } from '../three/componentMeshes';

export interface SchematicRun {
  signal: AbortSignal;
  current: () => WorkspaceCore;
}

export function schematicExport(core: WorkspaceCore, run: SchematicRun) {
  return runElectricalExport(core, run) as Promise<SchematicResult & { validation?: BoardNativeResult }>;
}

export function kitElectricalExport(core: WorkspaceCore, run: SchematicRun, designFingerprint: string) {
  return runElectricalExport(core, run, designFingerprint) as Promise<KitElectrical>;
}

async function runElectricalExport(core: WorkspaceCore, run: SchematicRun, designFingerprint?: string) {
  const kit = designFingerprint !== undefined;
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
    const meshFiles = core.project.electronicsBoard ? await sourcedMeshFiles(core.parts) : undefined;

    guard();

    const dispatchStart = performance.now();
    const pending =
      kit || input.project.electronicsBoard?.routed
        ? client.call(kit ? 'prepareKit' : 'prepareExport', { ...input, meshFiles })
        : client.call('build', { ...input, meshFiles });

    performance.measure('schematic:dispatch', { start: dispatchStart });

    const prepared = await pending;

    guard();

    const native =
      'request' in prepared && prepared.request ? await validateNativeBoard(prepared.request, run.signal) : null;

    guard();

    if (kit && 'request' in prepared) {
      const result = await client.call('kit', {
        prepared,
        result: native,
        designFingerprint: designFingerprint!,
      });

      guard();

      return result;
    }

    const result = 'request' in prepared ? await client.call('finishExport', { prepared, result: native }) : prepared;

    guard();
    performance.measure('schematic:prepare', { start });

    return native ? { ...result, validation: native } : result;
  } finally {
    run.signal.removeEventListener('abort', stop);
    client.dispose();
  }
}
