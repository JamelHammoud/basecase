import React from 'react';
import type { SignalBus } from '../../../cases/console/signalBus';
import { lastAtOrBefore } from '../../../dataLayers/track';
import { TracePlot, type Trace } from '../../../design-system';
import { pairedX, sampleTotal } from './plotSeries';
import { recent } from './series';

const H = 120;
const TONES: Trace['tone'][] = ['accent', 'primary', 'muted'];

interface XYProps {
  ids: string[];
  x: string;
  bus: SignalBus;
  seconds: number;
}

function nowPoint(trace: Trace, times: ArrayLike<number>, at: number): Trace | null {
  const i = lastAtOrBefore(times, at);

  if (i < 0) return null;

  const value = trace.values[i];
  const x = trace.x?.[i] ?? Number.NaN;

  if (!Number.isFinite(value) || !Number.isFinite(x)) return null;

  return { id: `${trace.id}-now`, values: [value], x: [x], tone: 'accent', points: true };
}

export const PlotXY: React.FC<XYProps> = ({ ids, x, bus, seconds }) => {
  const head = bus.playhead();
  const shown = (id: string) => (head ? bus.series(id) : recent(bus.series(id), seconds));
  const xs = shown(x);
  const lines = ids.map((id, i) => {
    const y = shown(id);
    const trace: Trace = { id, values: y.v, x: pairedX(xs, y), tone: TONES[Math.min(i, TONES.length - 1)] };

    return { trace, times: y.t };
  });
  const now = head ? lines.flatMap((l) => nowPoint(l.trace, l.times, head.at) ?? []) : [];

  return (
    <div data-testid="plot" data-lines={ids.length} data-x={x} data-samples={sampleTotal(bus, [...ids, x])}>
      <TracePlot traces={[...lines.map((l) => l.trace), ...now]} height={H} />
    </div>
  );
};
