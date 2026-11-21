import type { Dataset, ImageMembers } from '../../datasets/datasetFile';
import type { FrozenImageSample } from '../../datasets/snapshotImages';
import { loadDatasetContent } from '../../datasets/datasetStore/content';
import { loadFrameSetManifest } from '../frameSetStore';
import { imageDatasetWorker } from '../imageDatasetWorker';
import { imageGroups, type ImageGroupMembership } from '../conditions';
import type { TrainingRequirement } from './requirementTypes';

const defaults = { manifest: loadFrameSetManifest, content: loadDatasetContent };

async function frozenChoices(input: {
  samples: FrozenImageSample[];
  members: ImageMembers[];
  ports: typeof defaults;
  signal?: AbortSignal;
}) {
  const groups: ImageGroupMembership[] = [];
  const classes = new Map(
    input.members.filter((member) => member.classes).map((member) => [member.frameSetId, member.classes!]),
  );

  for (const sample of input.samples) {
    input.signal?.throwIfAborted();

    if (sample.groups && classes.has(sample.frameSetId)) {
      groups.push(sample.groups);

      continue;
    }

    const bytes = await input.ports.content(sample.content);

    if (!bytes) continue;

    const metadata = await imageDatasetWorker.call('snapshotChoices', { sample, bytes }, [bytes.buffer]);

    groups.push(sample.groups ?? metadata.groups);
    classes.set(sample.frameSetId, metadata.classes);
  }

  return { groups, classes: [...classes.values()].flat() };
}

export async function requirementChoices(dataset: Dataset, ports = defaults, signal?: AbortSignal) {
  const selected = dataset.versions.find((version) => version.n === dataset.selectedVersion);
  const members = selected?.imageMembers ?? dataset.imageMembers ?? [];
  const values = selected?.snapshot
    ? await frozenChoices({ samples: selected.snapshot.images, members, ports, signal })
    : await workingChoices(members, ports);
  const groups = new Map<string, TrainingRequirement['group']>();
  const add = (kind: 'condition' | 'camera', name: string) =>
    groups.set(JSON.stringify({ kind, name }), { kind, name });

  for (const sample of values.groups) {
    sample.declared.forEach((name) => add('condition', name));
    add('camera', sample.camera);
  }

  return { groups: [...groups.values()], classes: [...new Set(values.classes)].sort() };
}

async function workingChoices(members: ImageMembers[], ports: typeof defaults) {
  const manifests = await Promise.all(members.map((member) => ports.manifest(member.frameSetId)));

  return {
    groups: manifests.flatMap((manifest, index) => {
      const ids = new Set(members[index].frameIds);

      return manifest?.frames.filter((frame) => ids.has(frame.id)).map((frame) => imageGroups(manifest, frame)) ?? [];
    }),
    classes: manifests.flatMap((manifest) => manifest?.classes.map((category) => category.name) ?? []),
  };
}
