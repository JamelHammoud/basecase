import type { ImageMembers } from '../datasets/datasetFile';
import { applyFrameConditions, MAX_CONDITIONS } from '../vision/conditions';
import { loadFrameSetManifest } from '../vision/frameSetStore';
import { editLabelMetadataBatch } from './frameLabelStorage';

export interface SelectedConditionImage {
  frameSetId: string;
  frameId: string;
}

interface ConditionEdit {
  members: ImageMembers[];
  selected: SelectedConditionImage[];
  name: string;
  remove: boolean;
}

export const editImageConditions = (input: ConditionEdit) =>
  editLabelMetadataBatch(async (save) => {
    const edits = selectedConditionEdits(input);
    const names = new Set<string>(input.remove ? [] : [input.name]);

    const manifests = new Map<string, Awaited<ReturnType<typeof loadFrameSetManifest>>>();

    for (const member of input.members) {
      const manifest = await loadFrameSetManifest(member.frameSetId);

      if (!manifest) throw new Error('Choose a saved image dataset.');

      manifests.set(member.frameSetId, manifest);

      for (const name of manifest.conditions ?? []) names.add(name);

      if (names.size > MAX_CONDITIONS) throw new Error('Use at most 32 image conditions.');

      const ids = edits.get(member.frameSetId);

      if (ids) applyFrameConditions(manifest, { ids, name: input.name, remove: input.remove });
    }

    for (const [id, ids] of edits) {
      const stored = manifests.get(id);

      if (!stored) throw new Error('Choose a saved image dataset.');

      const next = applyFrameConditions(stored, { ids, name: input.name, remove: input.remove });

      if (next !== stored) await save(next, stored);
    }
  });

function selectedConditionEdits(input: ConditionEdit) {
  if (!input.selected.length || input.selected.length > 1000) throw new Error('Select at most 1,000 images.');

  const edits = new Map<string, string[]>();

  for (const selected of input.selected) {
    const member = input.members.find((item) => item.frameSetId === selected.frameSetId);

    if (!member?.frameIds.includes(selected.frameId)) throw new Error('Choose images from the working dataset.');

    edits.set(selected.frameSetId, [...(edits.get(selected.frameSetId) ?? []), selected.frameId]);
  }

  return edits;
}
