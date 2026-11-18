import { useEffect, useState } from 'react';
import type { Dataset } from '../../datasets/datasetFile';
import { loadFrameSetManifest } from '../../vision/frameSetStore';
import type { TrainingRequirement } from '../../vision/training/requirementTypes';

export function useRequirementChoices(dataset: Dataset) {
  const [loaded, setLoaded] = useState<{
    dataset: Dataset;
    groups: TrainingRequirement['group'][];
    classes: string[];
  } | null>(null);

  useEffect(() => {
    let live = true;

    const load = async () => {
      const snapshot = dataset.versions.find((version) => version.n === dataset.selectedVersion)?.snapshot;
      const members =
        dataset.versions.find((version) => version.n === dataset.selectedVersion)?.imageMembers ??
        dataset.imageMembers ??
        [];
      const manifests = await Promise.all(members.map((member) => loadFrameSetManifest(member.frameSetId)));
      const groups = new Map<string, TrainingRequirement['group']>();
      const add = (kind: 'condition' | 'camera', name: string) =>
        groups.set(JSON.stringify({ kind, name }), { kind, name });
      const samples =
        snapshot?.images.map((sample) => sample.groups) ??
        manifests.flatMap(
          (manifest, index) =>
            manifest?.frames
              .filter((frame) => members[index].frameIds.includes(frame.id))
              .map((frame) => ({
                camera: frame.camera,
                declared: manifest.conditions ?? [],
                labels: frame.conditions ?? [],
              })) ?? [],
        );

      for (const sample of samples) {
        sample?.declared.forEach((name) => add('condition', name));

        if (sample) add('camera', sample.camera);
      }

      const classes = [...new Set(members.flatMap((member) => member.classes ?? []))].sort();

      if (live) setLoaded({ dataset, groups: [...groups.values()], classes });
    };

    void load().catch(() => {
      if (live) setLoaded({ dataset, groups: [], classes: [] });
    });

    return () => {
      live = false;
    };
  }, [dataset]);

  return loaded?.dataset === dataset ? loaded : null;
}
