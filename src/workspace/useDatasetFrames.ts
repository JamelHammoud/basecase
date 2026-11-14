import { useEffect, useState } from 'react';
import type { Dataset } from '../datasets/datasetFile';
import { imageManifestsOf } from '../datasets/imageDataset';
import type { FrameSetManifest } from '../vision/frameSet';
import { errorMessage } from '../utils/errorMessage';

interface LoadedFrames {
  members: Dataset['imageMembers'];
  sets: FrameSetManifest[];
  error: string | null;
}

export function useDatasetFrames(dataset: Dataset | null) {
  const members = dataset?.imageMembers;
  const [loaded, setLoaded] = useState<LoadedFrames | null>(null);

  useEffect(() => {
    if (!members?.length) return;

    let live = true;

    imageManifestsOf({ imageMembers: members }).then(
      (sets) => live && setLoaded({ members, sets, error: null }),
      (error: unknown) => live && setLoaded({ members, sets: [], error: errorMessage(error) }),
    );

    return () => {
      live = false;
    };
  }, [members]);

  if (!members?.length) return { sets: [], error: null, loading: false };

  return loaded?.members === members
    ? { sets: loaded.sets, error: loaded.error, loading: false }
    : { sets: [], error: null, loading: true };
}
