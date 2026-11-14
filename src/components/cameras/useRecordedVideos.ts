import { useEffect, useState } from 'react';
import type { TryTimeline } from '../../workspace/useTryTimeline';
import type { StoredTry } from '../../cases/tryFile';
import { loadManifests } from '../../cases/tryStore';

export function useRecordedVideos(timeline: Pick<TryTimeline, 'open' | 'record'>): StoredTry | null {
  const id = timeline.open ? (timeline.record?.id ?? null) : null;
  const [loaded, setLoaded] = useState<{ id: string; manifest: StoredTry | null } | null>(null);

  useEffect(() => {
    if (!id) return;

    let alive = true;

    void loadManifests([id])
      .then((manifests) => {
        if (alive) setLoaded({ id, manifest: manifests[0] ?? null });
      })
      .catch(() => {
        if (alive) setLoaded({ id, manifest: null });
      });

    return () => {
      alive = false;
    };
  }, [id]);

  return loaded?.id === id ? loaded.manifest : null;
}

export const recordedVideoKeys = (recorded: StoredTry | null) => recorded?.videos?.map((video) => video.camera) ?? [];

export const recordedFeedEligible = (open: boolean, playback: boolean, videos: string[]) =>
  open && (!playback || !videos.length);
