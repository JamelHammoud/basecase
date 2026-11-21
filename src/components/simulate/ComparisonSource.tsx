import { Badge, FieldRow, NumberInput, Select } from '../../design-system';
import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import type { ComparisonData } from './useComparisonData';
import { ComparisonProvenance } from './ComparisonProvenance';
import { ComparisonStates } from './ComparisonStates';
import { comparisonNumber } from './comparisonText';
import { ComparisonMessages } from './ComparisonMessages';
import { ComparisonSignals } from './ComparisonSignals';
import { ComparisonMedia } from './ComparisonMedia';

export function ComparisonSource({
  saved,
  data,
  index,
}: {
  saved: SavedTimeline;
  data: ComparisonData;
  index: number;
}) {
  const source = saved.sources[index];
  const choice = data.selections[index];
  const snapshot = data.read?.values[index];

  return (
    <section
      data-testid="comparison-source"
      data-try={source.stored.id}
      data-origin-hash={source.stored.origin?.kind === 'file' ? source.stored.origin.hash : source.hash}
      className="min-w-0 flex flex-col gap-3"
    >
      <ComparisonProvenance source={source} index={index} />
      <output className="text-[12px] text-white/60 tabular" data-testid="source-time">
        {comparisonNumber(source.start + saved.shared - (saved.offsets[index] ?? 0))} s
      </output>
      {saved.sources.length === 2 && (
        <>
          <FieldRow label="Offset">
            <NumberInput
              aria-label="Offset"
              value={saved.offsets[index] ?? 0}
              unit="s"
              precision={3}
              step={0.02}
              onChange={(value) => saved.offset(index, value)}
            />
          </FieldRow>

          <Select
            aria-label="Align event"
            value=""
            options={[
              { value: '', label: 'Align Event' },
              { value: 'elapsed', label: 'Elapsed time' },
              ...source.events.map((event) => ({ value: event.id, label: event.name })),
            ]}
            onChange={(event) =>
              event.target.value === 'elapsed' ? saved.offset(index, 0) : saved.align(index, event.target.value)
            }
          />
        </>
      )}
      {(source.channelsClipped || source.eventsClipped) && <Badge variant="amber">Clipped</Badge>}
      <ComparisonSignals saved={saved} data={data} index={index} />
      <ComparisonStates
        source={source}
        snapshot={snapshot}
        saved={saved}
        index={index}
        signal={choice.state}
        onSignal={(state) => data.select(index, { state })}
      />
      <ComparisonMedia saved={saved} index={index} maxAge={data.maxAge} />
      <ComparisonMessages
        source={source}
        snapshot={snapshot}
        topic={choice.topic}
        maxAge={data.maxAge}
        onTopic={(topic) => data.select(index, { topic })}
      />
    </section>
  );
}
