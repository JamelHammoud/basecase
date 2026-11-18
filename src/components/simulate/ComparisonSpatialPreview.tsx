import { useState } from 'react';
import { Badge, Select } from '../../design-system';
import { sourceTime } from '../../cases/comparison/comparison';
import { useComparisonBitmap } from './useComparisonBitmap';
import { comparisonNumber } from './comparisonText';
import type { ComparisonMediaProps } from './ComparisonMedia';

export function ComparisonSpatialPreview({ saved, index, maxAge }: ComparisonMediaProps) {
  const source = saved.sources[index];
  const [topic, setTopic] = useState(source.spatial[0]);
  const { canvas: canvasRef, shown } = useComparisonBitmap({
    consumer: saved.opened!.consumers[index],
    operation: 'spatial',
    topic,
    time: sourceTime(source, saved.shared, saved.offsets[index] ?? 0),
    maxAge,
  });
  const metadata = shown?.metadata ?? { at: null, bytes: 0 };
  const { frame, at, span, clipped } = metadata;
  const stale = at !== null && sourceTime(source, saved.shared, saved.offsets[index] ?? 0) - at > maxAge;
  const missing = shown?.error ?? metadata.missing ?? (stale ? 'Stale sample' : null);

  return (
    <section className="flex flex-col gap-2" data-testid="comparison-spatial" data-frame={frame}>
      <Select
        aria-label="Spatial layer"
        value={topic}
        options={source.spatial.map((value) => ({ value, label: value }))}
        onChange={(event) => setTopic(event.target.value)}
      />
      <div className="flex flex-wrap gap-2 text-[12px] text-white/60">
        <span>Local XY view</span>
        <span>{frame}</span>
        {at !== null && <output>{comparisonNumber(at)} s</output>}
        <span>{span && `${comparisonNumber(span)} mm`}</span>
      </div>
      <canvas ref={canvasRef} width={1} height={1} className="w-full aspect-[2/1] rounded-lg bg-[#1b1b1b]" />
      {missing && <span className="text-[13px] text-amber-400">{missing}</span>}
      {clipped && <Badge variant="amber">Clipped</Badge>}
    </section>
  );
}
