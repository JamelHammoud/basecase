import { useRef } from 'react';
import { loadOnshape } from '../onshape/loadOnshape';
import { fetchOnshapeUpdate } from '../onshape/onshapeTarget';
import type { OnshapeUpdate } from '../onshape/onshapeUpdate';
import { prepareParts } from '../three/partMesh/prepare';
import { errorMessage } from '../utils/errorMessage';
import { IS_WEB_DEMO } from '../utils/platform/webDemo';
import { plural } from '../utils/plural';
import { attempt } from './helpers';
import type { WorkspaceCore } from './useWorkspaceCore';

export const updatedMessage = (changes: number) => `${changes ? plural(changes, 'change') : 'No changes'} from Onshape`;

export function useOnshapeUpdate(core: WorkspaceCore) {
  const { docs, showToast } = core;
  const { partsRef, projectRef, commitParts, updateProjectNow } = docs;
  const busyRef = useRef(false);

  const current = () => ({ parts: partsRef.current, joints: projectRef.current.joints ?? [] });

  const fetchPlan = async (groupId: string): Promise<OnshapeUpdate | null> => {
    const say = (message: string) => showToast(message, { tone: 'progress' });
    const plan = await fetchOnshapeUpdate({ groupId, current, load: (link) => loadOnshape(link, say) });

    if (plan?.changes) await prepareParts(plan.changed);

    return plan;
  };

  const apply = (plan: OnshapeUpdate) => {
    commitParts(() => plan.parts);
    updateProjectNow((p) => ({ ...p, joints: plan.joints }));
  };

  const update = async (groupId: string) => {
    if (IS_WEB_DEMO || busyRef.current) return;

    busyRef.current = true;

    const outcome = await attempt(() => fetchPlan(groupId));

    busyRef.current = false;

    if (!outcome.ok) {
      showToast(errorMessage(outcome.error), { tone: 'error' });

      return;
    }

    if (!outcome.value) return;

    if (outcome.value.changes) apply(outcome.value);

    showToast(updatedMessage(outcome.value.changes));
  };

  return { update };
}

export type OnshapeUpdater = ReturnType<typeof useOnshapeUpdate>;
