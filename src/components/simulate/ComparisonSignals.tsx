import { Badge, Select } from '../../design-system';
import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import type { ComparisonData } from './useComparisonData';
import { ComparisonPlot } from './ComparisonPlot';
import { comparisonText } from './comparisonText';

export function ComparisonSignals({
  saved,
  data,
  index,
}: {
  saved: SavedTimeline;
  data: ComparisonData;
  index: number;
}) {
  const channel = data.channels[index];
  const choice = data.selections[index];
  const sample = data.read?.values[index]?.samples.find((value) => value.id === choice.signal);
  const plot = data.plots[index];

  if (!channel) return null;

  return (
    <>
      <Select
        aria-label="Signal"
        value={choice.signal}
        options={saved.sources[index].channels
          .filter((c) => c.kind === 'number')
          .map((c) => ({ value: c.id, label: c.id }))}
        onChange={(event) => data.select(index, { signal: event.target.value })}
      />
      <div className="text-[13px] text-white/90 flex flex-wrap gap-2">
        <output data-testid="comparison-value" data-signal={choice.signal}>
          {comparisonText(sample)} {channel.unit ?? 'Units unknown'}
        </output>
        {(sample?.clipped || channel.clipped) && <Badge variant="amber">Clipped</Badge>}
      </div>
      {!data.matched && plot && <ComparisonPlot saved={saved} plots={[{ index, plot }]} unit={channel.unit ?? ''} />}
    </>
  );
}
