import { frozenClient } from '../kit/frozenClient';
import { prepareKit, kitGuard } from './kitExport';
import type { WorkspaceCore } from './useWorkspaceCore';

export async function prepareFrozenBuild(core: WorkspaceCore, signal: AbortSignal, current: () => WorkspaceCore) {
  const run = { signal, current, assemblyOnly: true };
  const guard = kitGuard(core, run);
  const client = frozenClient();

  signal.addEventListener('abort', client.dispose, { once: true });

  try {
    const job = await prepareKit(core, run);
    const meshes = await core.viewportRef.current!.printMeshes(
      job.parts.filter((part) => part.role === 'solid').map((part) => part.id),
    );

    guard();

    const content = await client.call('prepare', { job, meshes });

    guard();

    return { content, guard };
  } finally {
    signal.removeEventListener('abort', client.dispose);
    client.dispose();
  }
}
