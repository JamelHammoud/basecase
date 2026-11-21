import { stateBands } from '../caseRun/panels/stateBands';
import type { SourceInfo, SourceSnapshot } from '../../cases/comparison/comparisonJobs';
import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import { Select } from '../../design-system';
import { comparisonText } from './comparisonText';

interface StatesProps {
  source: SourceInfo;
  snapshot: SourceSnapshot | undefined;
  saved: SavedTimeline;
  index: number;
  signal: string;
  onSignal: (signal: string) => void;
}

export function ComparisonStates({ source, snapshot, saved, index, signal, onSignal }: StatesProps) {
  const channels = source.channels.filter((channel) => channel.kind === 'state');

  if (!channels.length) return null;

  const events = source.events.filter((event) => event.signal === signal);
  const offset = saved.offsets[index] ?? 0;
  const channelEnd = channels.find((channel) => channel.id === signal)?.end ?? source.start;
  const localEnd = source.stateEventsClipped ? (events.at(-1)?.at ?? source.start) : channelEnd;
  const end = localEnd - source.start + offset;
  const span = saved.end - saved.origin || 1;
  const bands = stateBands(
    { t: events.map((event) => event.at - source.start + offset), values: events.map((event) => event.value ?? '') },
    { from: saved.origin, to: Math.min(saved.end, end) },
  ).map((band) => ({
    ...band,
    left: (band.from - saved.origin) / span,
    width: (Math.min(band.to, end) - band.from) / span,
  }));
  const sample = snapshot?.samples.find((value) => value.id === signal);

  return (
    <section data-testid="comparison-state" className="flex flex-col gap-2">
      <Select
        aria-label="State"
        value={signal}
        options={channels.map((c) => ({ value: c.id, label: c.id }))}
        onChange={(e) => onSignal(e.target.value)}
      />
      <div className="relative h-[32px] overflow-hidden rounded-lg bg-[#262626]">
        {bands.map((band, i) => (
          <div
            key={i}
            className="absolute inset-y-0 text-[12px] flex items-center px-1 overflow-hidden"
            style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%`, background: band.fill }}
            onClick={() => saved.jump((band.from - saved.origin) / saved.dt)}
          >
            {band.value}
          </div>
        ))}
      </div>
      <output className="text-[13px] text-white/90">{comparisonText(sample)}</output>
    </section>
  );
}
