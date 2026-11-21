import { TracePlot, type Trace } from '../../design-system';
import type { SavedTimeline } from '../../workspace/useSavedTimeline';
import type { PreparedPlot } from '../../cases/comparison/comparisonPlots';

interface PlotProps {
  saved: SavedTimeline;
  plots: Array<{ index: number; plot: PreparedPlot }>;
  unit: string;
}

export function ComparisonPlot({ saved, plots, unit }: PlotProps) {
  const traces: Trace[] = plots.map(({ index, plot }) => ({
    id: saved.sources[index].stored.id,
    values: plot.v,
    x: plot.t.map((time) => time - saved.sources[index].start + (saved.offsets[index] ?? 0)),
    tone: index === 0 ? 'accent' : 'primary',
  }));

  traces.push({ id: 'range', values: [Number.NaN, Number.NaN], x: [saved.origin, saved.end], tone: 'muted' });

  const count = Math.max(2, ...plots.map(({ plot }) => plot.v.length));
  const toFrame = (sample: number) => (sample / (count - 1)) * (saved.frames - 1);
  const toPlot = (frame: number) => (frame / Math.max(saved.frames - 1, 1)) * (count - 1);

  return (
    <TracePlot
      traces={traces}
      height={100}
      units={{ x: 's', y: unit }}
      playhead={toPlot(saved.frame)}
      onSeek={(sample) => saved.jump(toFrame(sample))}
      loop={saved.loop && [toPlot(saved.loop[0]), toPlot(saved.loop[1])]}
      onLoop={(range) => saved.setLoop(range && [Math.round(toFrame(range[0])), Math.round(toFrame(range[1]))])}
    />
  );
}
