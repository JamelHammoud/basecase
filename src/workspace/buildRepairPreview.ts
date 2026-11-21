import { prepareBuildRepair } from '../kit/buildRepairClient';
import { buildStorage } from '../kit/buildStorage';
import { storedBuildContent } from '../kit/buildPersistence';
import { frozenClient } from '../kit/frozenClient';
import { prepareFrozenBuild } from './prepareFrozenBuild';
import type { WorkspaceCore } from './useWorkspaceCore';

export async function buildRepairPreview(
  core: WorkspaceCore,
  run: {
    signal: AbortSignal;
    current: () => WorkspaceCore;
    selected: () => string;
    target: string;
  },
) {
  const record = core.buildAlong.frozen!.record;
  const snapshot =
    run.target === 'current'
      ? await prepareFrozenBuild(core, run.signal, run.current)
      : { content: await storedBuildContent(buildStorage, run.target), guard: () => run.signal.throwIfAborted() };
  const guard = () => {
    snapshot.guard();

    const current = run.current().buildAlong.frozen?.record;

    if (run.selected() !== run.target || current?.id !== record.id || current.configuration !== record.configuration)
      throw new Error('The selection changed. Compare the revisions again.');
  };
  const source = await storedBuildContent(buildStorage, record.configuration ?? record.kit);
  const plan = await prepareBuildRepair(source, snapshot.content, run.signal);
  const client = frozenClient();

  run.signal.addEventListener('abort', client.dispose, { once: true });

  try {
    const [sourceKit, targetKit] = await Promise.all([
      client.call('read', source),
      client.call('read', snapshot.content),
    ]);

    guard();

    return { target: snapshot.content, sourceKit, targetKit, plan, guard };
  } finally {
    run.signal.removeEventListener('abort', client.dispose);
    client.dispose();
  }
}
