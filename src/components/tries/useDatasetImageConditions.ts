import { useEffect, useState } from 'react';
import type { ImageMembers } from '../../datasets/datasetFile';
import { loadFrameSetManifest } from '../../vision/frameSetStore';

export function useDatasetImageConditions(members: ImageMembers[] | undefined) {
  const [loaded, setLoaded] = useState<{ members: typeof members; labels: Map<string, string[]> } | null>(null);

  useEffect(() => {
    let live = true;

    const load = async () => {
      const labels = new Map<string, string[]>();

      for (const member of members ?? []) {
        const manifest = await loadFrameSetManifest(member.frameSetId);

        if (!live) return;

        const selected = new Set(member.frameIds);

        for (const frame of manifest?.frames ?? []) {
          if (selected.has(frame.id)) labels.set(`${member.frameSetId}:${frame.id}`, frame.conditions ?? []);
        }
      }

      if (live) setLoaded({ members, labels });
    };

    void load().catch(() => {
      if (live) setLoaded({ members, labels: new Map() });
    });

    return () => {
      live = false;
    };
  }, [members]);

  return loaded?.members === members ? loaded?.labels : undefined;
}
