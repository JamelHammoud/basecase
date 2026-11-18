import { useEffect, useState } from 'react';
import { sourceTime } from '../../cases/comparison/comparison';
import type { SourceInfo, SourceSnapshot } from '../../cases/comparison/comparisonJobs';
import type { PreparedPlot } from '../../cases/comparison/comparisonPlots';
import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import { errorMessage } from '../../utils/errorMessage';

export interface SourceSelection {
  signal: string;
  state: string;
  topic: string;
}

const initial = (info: SourceInfo): SourceSelection => ({
  signal:
    (info.channels.find((c) => c.kind === 'number' && c.unit) ?? info.channels.find((c) => c.kind === 'number'))?.id ??
    '',
  state:
    (
      info.channels.find((c) => c.kind === 'state' && /(mode|state|status|\.data$)/u.test(c.id)) ??
      info.channels.find((c) => c.kind === 'state')
    )?.id ?? '',
  topic: info.topics[0]?.topic ?? '',
});

function useSnapshots(saved: SavedTimeline, selections: SourceSelection[], maxAge: number) {
  const [read, setRead] = useState<{ key: string; values: SourceSnapshot[]; error: string | null } | null>(null);
  const { opened, sources, shared, offsets } = saved;
  const key = JSON.stringify([sources.map((s) => s.hash), shared, offsets, selections.map((s) => s.topic), maxAge]);

  useEffect(() => {
    if (!opened) return;

    let current = true;

    void Promise.all(
      opened.consumers.map((consumer, i) =>
        consumer.call('seek', {
          time: sourceTime(sources[i], shared, offsets[i] ?? 0),
          rule: { kind: 'previous', maxAge },
          topic: selections[i].topic,
        }),
      ),
    )
      .then((values) => {
        if (current) setRead({ key, values, error: null });
      })
      .catch((error: unknown) => {
        if (current) setRead({ key, values: [], error: errorMessage(error) });
      });

    return () => {
      current = false;
    };
  }, [opened, sources, shared, offsets, selections, maxAge, key]);

  return read?.key === key ? read : null;
}

function usePlots(saved: SavedTimeline, selections: SourceSelection[], maxAge: number) {
  const [prepared, setPrepared] = useState<{ key: string; plots: PreparedPlot[] } | null>(null);
  const { opened } = saved;
  const key = JSON.stringify([opened?.sources.map((s) => s.hash), selections.map((s) => s.signal), maxAge]);

  useEffect(() => {
    if (!opened) return;

    let current = true;

    void Promise.all(
      opened.consumers.map((consumer, i) =>
        consumer.call('plot', {
          id: selections[i].signal,
          rule: { kind: 'previous', maxAge },
        }),
      ),
    )
      .then((plots) => {
        if (current) setPrepared({ key, plots });
      })
      .catch(() => {});

    return () => {
      current = false;
    };
  }, [opened, selections, maxAge, key]);

  return prepared?.key === key ? prepared.plots : [];
}

export function useComparisonData(saved: SavedTimeline) {
  const [selections, setSelections] = useState(() => saved.sources.map(initial));
  const [maxAge, setMaxAge] = useState(0.5);
  const [matched, setMatched] = useState(false);
  const read = useSnapshots(saved, selections, maxAge);
  const plots = usePlots(saved, selections, maxAge);
  const channels = saved.sources.map((source, i) => source.channels.find((c) => c.id === selections[i]?.signal));
  const compatible = channels.length === 2 && !!channels[0]?.unit && channels[0].unit === channels[1]?.unit;
  const samples =
    read?.values.map((snapshot, i) => snapshot.samples.find((sample) => sample.id === selections[i].signal)) ?? [];
  const [a, b] = samples;
  const difference =
    compatible &&
    matched &&
    a?.status === 'sample' &&
    b?.status === 'sample' &&
    typeof a.value === 'number' &&
    typeof b.value === 'number'
      ? a.value - b.value
      : null;

  return {
    selections,
    maxAge,
    setMaxAge,
    read,
    plots,
    compatible,
    matched,
    setMatched,
    channels,
    difference,
    select: (i: number, patch: Partial<SourceSelection>) => {
      setMatched(false);
      setSelections((previous) => previous.map((choice, index) => (index === i ? { ...choice, ...patch } : choice)));
    },
  };
}

export type ComparisonData = ReturnType<typeof useComparisonData>;
