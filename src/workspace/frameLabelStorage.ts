import { loadDatasets, saveDataset } from '../datasets/datasetStore';
import { newDataset } from '../datasets/datasetFile';
import type { FrameSet } from '../vision/frameSet';
import { hashFrameSet, saveFrameSet } from '../vision/frameSetStore';

export async function saveLabelFrames(set: FrameSet) {
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
