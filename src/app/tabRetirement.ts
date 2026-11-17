import type { WorkspaceHandle } from '../SceneWorkspace';
import { platformBridge } from '../utils/platformBridge';
import type { ClosedTab, Metas, TabEntry } from './tabModel';

interface RetireInput {
  closing: TabEntry[];
  list: TabEntry[];
  metas: Metas;
  handles: Map<string, WorkspaceHandle>;
  discard: boolean;
  onError: (error: unknown) => void;
}

export const closedSeed = (tab: ClosedTab) => tab.ready ?? Promise.resolve(tab.seed);

function flushedSeed(handle: WorkspaceHandle, onError: RetireInput['onError']) {
  const seed = handle.snapshot();

  return handle
    .flush()
    .then(() => handle.snapshot())
    .catch((error: unknown) => {
      onError(error);

      return seed;
    });
}

export function retireTabs({ closing, list, metas, handles, discard, onError }: RetireInput) {
  const remember: ClosedTab[] = [];
  let stoppedAgent = false;

  for (const tab of closing) {
    const handle = handles.get(tab.id);
    const meta = metas[tab.id];

    if (meta?.busy) {
      stoppedAgent = true;
      handle?.stopAgent();
    }

    handle?.persistChat();

    if (discard) handle?.discard();

    const seed = handle ? handle.snapshot() : tab.seed;
    const ready = !discard && handle ? flushedSeed(handle, onError) : undefined;

    if (seed && !meta?.pristine && !discard) remember.push({ seed, ready, index: list.indexOf(tab) });

    platformBridge.closeAcpWorkspace(tab.id);
  }

  return { remember, stoppedAgent };
}
