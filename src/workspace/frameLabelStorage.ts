import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import { newDataset } from '../datasets/datasetFile';
import { datasetWrites } from '../datasets/datasetStore/datasetWrites';
import type { FrameSet } from '../vision/frameSet';
import { hashFrameSet, loadFrameSet, loadFrameSetManifest, saveFrameSet } from '../vision/frameSetStore';
import { mergeFrameLabels } from '../vision/labelEditsClient';

const write = datasetWrites();
const labelState = (set: FrameSet) => ({
  classes: set.classes,
  frames: set.frames.map(({ id, annotations }) => ({ id, annotations })),
});

export const saveLabelFrames = (set: FrameSet) => write('frame-labels', () => persistLabels(set));

export const saveLabelEdits = (previous: FrameSet, next: FrameSet) =>
  editLabelFrames(
    next.id,
    async (stored) => {
      const merged = await mergeFrameLabels({
        previous: labelState(previous),
        next: labelState(next),
        stored: labelState(stored),
      });
      const set = {
        ...stored,
        classes: merged.classes,
        frames: stored.frames.map((frame, index) => ({ ...frame, annotations: merged.frames[index].annotations })),
      };

      return { set, result: merged.same ? next : set };
    },
    next,
  );

async function latestLabels(id: string, images?: FrameSet): Promise<FrameSet | null> {
  if (!images) return loadFrameSet(id);

  const manifest = await loadFrameSetManifest(id);

  if (!manifest) return null;

  const buffers = new Map(images.frames.map((frame) => [frame.id, frame]));
  const frames = manifest.frames.map((frame) => {
    const image = buffers.get(frame.id);

    if (!image) throw new Error('The dataset is missing an image.');

    return { ...frame, jpeg: image.jpeg, depth: image.depth };
  });

  return { ...manifest, frames };
}

export function editLabelFrames<T>(
  id: string,
  edit: (set: FrameSet) => Promise<{ set: FrameSet; result: T }>,
  images?: FrameSet,
): Promise<T> {
  return write('frame-labels', async () => {
    const original = await latestLabels(id, images);

    if (!original) throw new Error('Choose a saved image dataset.');

    const { set, result } = await edit(original);

    await persistLabels(set);

    return result;
  });
}

async function persistLabels(set: FrameSet) {
  await saveFrameSet(set);

  const hash = await hashFrameSet(set);
  const datasets = await loadDatasets();
  const classes = set.classes.map((category) => category.name);
  const members = { frameSetId: set.id, frameIds: set.frames.map((frame) => frame.id), hash, classes };
  const existing = datasets.filter((dataset) => dataset.imageMembers?.some((member) => member.frameSetId === set.id));

  for (const dataset of existing) {
    await saveDataset({
      ...dataset,
      imageMembers: dataset.imageMembers?.map((member) =>
        member.frameSetId === set.id ? { ...member, hash, classes } : member,
      ),
    });
  }

  if (existing.length) return existing[0];

  const dataset = newDataset({
    id: `dataset-${crypto.randomUUID()}`,
    name: set.name,
    task: set.name,
    sceneId: set.sceneId,
    caseId: set.caseId,
    members: [],
    imageMembers: [members],
    at: new Date().toISOString(),
  });

  await saveDataset(dataset);

  return dataset;
}
