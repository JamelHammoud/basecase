import { useState } from 'react';
import { Badge, Select } from '../../design-system';
import { sourceTime } from '../../cases/comparison/comparison';
import { useComparisonBitmap } from './useComparisonBitmap';
import { comparisonNumber } from './comparisonText';
import type { ComparisonMediaProps } from './ComparisonMedia';

export function ComparisonCamera({ saved, index, maxAge }: ComparisonMediaProps) {
  const source = saved.sources[index];
  const [camera, setCamera] = useState(source.cameras[0]);
  const { canvas: canvasRef, shown } = useComparisonBitmap({
    consumer: saved.opened!.consumers[index],
    operation: 'image',
    topic: camera,
    time: sourceTime(source, saved.shared, saved.offsets[index] ?? 0),
    maxAge,
  });
  const clipped = source.topics.some((topic) => topic.topic === camera && topic.clipped);

  return (
    <section className="flex flex-col gap-2" data-testid="comparison-camera" data-camera={camera}>
      <Select
        aria-label="Camera"
        value={camera}
        options={source.cameras.map((value) => ({ value, label: value }))}
        onChange={(event) => setCamera(event.target.value)}
      />
      <canvas
        ref={canvasRef}
        width={1}
        height={1}
        className="w-full max-h-[220px] object-contain rounded-lg bg-[#1b1b1b]"
      />
      {shown?.error && <span className="text-[13px] text-amber-400">{shown.error}</span>}
      {shown?.metadata.missing && <span className="text-[13px] text-white/60">{shown.metadata.missing}</span>}
      {shown?.metadata.at != null && (
        <output className="text-[12px] text-white/60">{comparisonNumber(shown.metadata.at)} s</output>
      )}
      {clipped && <Badge variant="amber">Clipped</Badge>}
    </section>
  );
}
