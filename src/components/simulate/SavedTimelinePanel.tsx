import { Button, ErrorBoundary, FieldRow, NumberInput, Spinner } from '../../design-system';
import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import { useComparisonData } from './useComparisonData';
import { ComparisonSource } from './ComparisonSource';
import { ComparisonPlot } from './ComparisonPlot';
import { comparisonNumber } from './comparisonText';

export function SavedTimelinePanel({ saved }: { saved: SavedTimeline }) {
  const data = useComparisonData(saved);

  if (saved.loading) return <Spinner />;

  return (
    <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
      <div className="flex items-center gap-3">
        <div className="max-w-[260px]">
          <FieldRow label="Previous sample" group>
            <NumberInput
              aria-label="Maximum sample age"
              value={data.maxAge}
              unit="s"
              min={0}
              max={60}
              step={0.02}
              precision={3}
              onChange={data.setMaxAge}
            />
          </FieldRow>
        </div>
        {saved.sources.length === 2 && (
          <Button
            variant={data.matched ? 'active' : 'ghost'}
            size="xs"
            disabled={!data.compatible}
            aria-pressed={data.matched}
            onClick={() => data.setMatched(!data.matched)}
          >
            Compare Signals
          </Button>
        )}
      </div>
      {data.read?.error && <p className="text-[13px] text-red-400">{data.read.error}</p>}
      <div className={`grid gap-4 ${saved.sources.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {saved.sources.map((source, index) => (
          <ErrorBoundary key={source.stored.id} region={source.stored.robot.name || source.stored.id}>
            <ComparisonSource saved={saved} data={data} index={index} />
          </ErrorBoundary>
        ))}
      </div>
      {data.matched && (
        <>
          <div className="text-[13px] text-white/90 flex gap-3">
            <span>A − B</span>
            <output data-testid="comparison-difference">
              {data.difference === null ? 'Missing sample' : comparisonNumber(data.difference)} {data.channels[0]?.unit}
            </output>
          </div>
          <ComparisonPlot
            saved={saved}
            unit={data.channels[0]?.unit ?? ''}
            plots={data.plots.map((plot, index) => ({ index, plot }))}
          />
        </>
      )}
    </div>
  );
}
