import { sourcedMeshFiles } from '../three/componentMeshes';
import { packParts } from '../three/packedMesh';
import { reply, workerClient } from '../utils/workerRpc';
import { frameSetManifestHash, type FrameSet, type TrainingFrame } from './frameSet';
import type { TryFramesHeader } from './tryFrames';
import type { TryFrameJob, TryFrameProgress, TryFrameScene } from './tryFramesTypes';

export type { TryFrameJob, TryFrameProgress, TryFrameScene, TryFrameSelection, TryFrameSource } from './tryFramesTypes';

type Handlers = {
  load: (job: TryFrameJob) => Promise<{ result: TryFramesHeader }>;
  next: (request: null) => Promise<{ result: TrainingFrame }>;
  close: (request: null) => { result: void };
};

async function localHandlers(): Promise<Handlers> {
  const { TryFramesSession } = await import('./tryFrames');
  const session = new TryFramesSession();

  return {
    load: async (job) => reply(await session.load(job)),
    next: async () => reply(await session.next()),
    close: () => reply(session.close()),
  };
}

async function packedScene(scene: TryFrameScene | undefined): Promise<TryFrameScene | undefined> {
  if (!scene) return undefined;

  return {
    ...scene,
    parts: packParts(scene.parts),
    world: packParts(scene.world),
    rig: scene.rig && { ...scene.rig, parts: [] },
    meshes: scene.meshes ?? (await sourcedMeshFiles([...scene.parts, ...scene.world])),
  };
}

export async function extractTryFrames(
  job: TryFrameJob,
  progress?: (value: TryFrameProgress) => void,
): Promise<FrameSet> {
  const local: { handlers: Promise<Handlers> | null } = { handlers: null };
  const client = workerClient<Handlers>(
    () => new Worker(new URL('./tryFrames.worker.ts', import.meta.url), { type: 'module' }),
    () => (local.handlers ??= localHandlers()),
  );

  try {
    const scene = await packedScene(job.scene);
    const tries = await Promise.all(
      job.tries.map(async (source) => ({ ...source, scene: await packedScene(source.scene) })),
    );
    const { count, ...header } = await client.call('load', { ...job, scene, tries });
    const frames: TrainingFrame[] = [];

    progress?.({ done: 0, total: count });

    for (let i = 0; i < count; i++) {
      frames.push(await client.call('next', null));
      progress?.({ done: i + 1, total: count });
    }

    const hash = await frameSetManifestHash(
      header,
      frames.map((frame) => frame.id),
    );

    return { ...header, id: `frames-${hash}`, frames };
  } finally {
    client.dispose();

    if (local.handlers) (await local.handlers).close(null);
  }
}
