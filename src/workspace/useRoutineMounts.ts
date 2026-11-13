import { sceneCapabilities } from '../routines/capabilities';
import type { Capability, Routine } from '../routines/schema';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { newId } from './helpers';
import { addItemFor, canAdd, mountPart } from './routineMount';
import type { CommitParts, ShowToast } from './types';

interface MountsInput {
  active: Routine | null;
  parts: ScenePart[];
  project: ProjectSettings;
  commitParts: CommitParts;
  updateProjectNow: (patch: (p: ProjectSettings) => ProjectSettings) => void;
  showToast: ShowToast;
}

export function useRoutineMounts({ active, parts, project, commitParts, updateProjectNow, showToast }: MountsInput) {
  const joints = project.joints ?? [];

  const addCapability = (capability: Capability) => {
    const item = addItemFor(capability);

    if (!item) return;

    const mounted = mountPart({ parts, joints, item, id: newId() });

    commitParts((prev) => [...prev, mounted.part]);
    updateProjectNow((p) => ({ ...p, joints: mounted.joints }));
    showToast(`Added ${item.name}`);
  };

  const has = new Set(active ? sceneCapabilities({ parts, joints }) : []);
  const missing = (active?.requires ?? []).filter((c) => !has.has(c) && canAdd(c));

  return { addCapability, missing };
}
