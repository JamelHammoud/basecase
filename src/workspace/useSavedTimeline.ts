import { useEffect, useState } from 'react';
import { loadManifests, loadRecordingBytes, onTriesChanged } from '../cases/tryStore';
import { comparisonSession, type OpenedComparison } from '../cases/comparison/comparisonSession';
import { comparisonConsumer } from '../cases/comparison/comparisonClient';
import { alignmentOffset } from '../cases/comparison/comparison';
import { useTimelinePlayback } from './useTimelinePlayback';

const DT = 0.02;

export function useSavedTimeline() {
  const [session] = useState(() =>
    comparisonSession({ manifests: loadManifests, recording: loadRecordingBytes }, comparisonConsumer),
  );
  const [opened, setOpened] = useState<OpenedComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [offsets, setOffsets] = useState<number[]>([]);
  const sources = opened?.sources ?? [];
  const origin = Math.min(0, ...offsets);
  const end = Math.max(0, ...sources.map((source, i) => source.end - source.start + (offsets[i] ?? 0)));
  const frames = sources.length ? Math.round((end - origin) / DT) + 1 : 0;
  const playback = useTimelinePlayback({ frames, dt: DT, seek: () => {} });
  const shared = origin + playback.frame * DT;

  useEffect(
    () => () => {
      session.close();
      setOpened(null);
      setLoading(false);
      setOffsets([]);
    },
    [session],
  );
  useEffect(
    () =>
      onTriesChanged(({ deleted }) => {
        if (!session.deleted(deleted)) return;

        setOpened(null);
        setLoading(false);
      }),
    [session],
  );

  const close = () => {
    session.close();
    playback.stop();
    setOpened(null);
    setLoading(false);
    setOffsets([]);
  };
  const show = async (ids: readonly string[], at = 0) => {
    playback.stop();
    setOpened(null);
    setLoading(true);
    setOffsets(ids.map(() => 0));

    const pending = session.open(ids);
    const ticket = session.version();

    try {
      const found = await pending;

      if (session.version() !== ticket) return false;

      setLoading(false);
      setOpened(found);

      if (!found) return false;

      const last = Math.max(...found.sources.map((source) => source.end - source.start));

      playback.reset(at, Math.round(last / DT) + 1);

      return true;
    } catch (error) {
      if (session.version() === ticket) setLoading(false);

      throw error;
    }
  };
  const offset = (index: number, value: number) => {
    if (!Number.isFinite(value) || Math.abs(value) > 86400) return;

    const next = sources.map((_, i) => (i === index ? value : (offsets[i] ?? 0)));
    const from = Math.min(0, ...next);
    const to = Math.max(...sources.map((source, i) => source.end - source.start + next[i]));

    setOffsets(next);
    playback.reset(Math.round((shared - from) / DT), Math.round((to - from) / DT) + 1);
  };

  return {
    active: !!opened || loading,
    loading,
    sources,
    opened,
    offsets,
    origin,
    shared,
    end,
    frames,
    dt: DT,
    ...playback,
    show,
    close,
    offset,
    align: (index: number, id: string) => {
      const source = sources[index];
      const event = source?.events.find((candidate) => candidate.id === id);

      if (event) offset(index, alignmentOffset(source, event, shared));
    },
  };
}

export type SavedTimeline = ReturnType<typeof useSavedTimeline>;
