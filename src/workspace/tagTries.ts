import { labelsOf, marked, retagged, sharedTags, tagsFrom, withLabels } from '../cases/tryLabels';
import { editTries, loadManifests } from '../cases/tryStore';

export const sharedTagsOf = async (ids: string[]) =>
  sharedTags((await loadManifests(ids)).map((stored) => labelsOf(stored).tags));

export function tagChange(text: string, before: string[]) {
  const add = tagsFrom(text);

  return { add, remove: before.filter((tag) => !add.includes(tag)) };
}

export const tagTries = (ids: string[], text: string, before: string[]) => {
  const change = tagChange(text, before);

  return editTries(ids, (stored) => withLabels(stored, { tags: retagged(labelsOf(stored).tags, change) }));
};

export const markTries = (ids: string[], verdict: 'passed' | 'failed') =>
  editTries(ids, (stored) => marked(stored, verdict));
