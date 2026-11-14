import React from 'react';
import type { Playhead } from '../../../cases/console/signalBus';
import { TracePlot, type Trace, type TraceTone } from '../../../design-system';
import { useBus, type BusReading, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { extent, recent, scaler } from './series';

const W = 300;
const H = 120;
const STROKES = ['#0d99ff', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.4)'];
const TONES: TraceTone[] = ['accent', 'primary', 'muted'];

const LivePlot: React.FC<{ panel: PanelViewProps<'plot'>['panel']; bus: BusReading }> = ({ panel, bus }) => {
  const seconds = 'seconds' in panel && panel.seconds !== undefined ? panel.seconds : 20;
  const ids = panel.signals.flatMap((s) => bus.expand(s));
  const lines = ids.map((id) => ({ id, s: recent(bus.series(id), seconds) }));
  const end = Math.max(0, ...lines.map((l) => l.s.t.at(-1) ?? 0));
  const x = scaler([end - seconds, end], [0, W]);
  const y = scaler(extent(lines.flatMap((l) => l.s.v)), [H, 0]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px] block" data-testid="plot" data-lines={lines.length}>
      {lines.map((l, i) => (
        <polyline
          key={l.id}
          fill="none"
          stroke={STROKES[i % STROKES.length]}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          points={l.s.t.map((t, k) => `${x(t).toFixed(1)},${y(l.s.v[k]).toFixed(1)}`).join(' ')}
        />
      ))}
    </svg>
  );
};

interface WholeTryProps {
  ids: string[];
  head: Playhead;
  seek: ((frame: number) => void) | null;
}

const WholeTry: React.FC<WholeTryProps> = ({ ids, head, seek }) => {
  const { track, frame } = head;
  const traces: Trace[] = ids.flatMap((id, i) => {
    const values = track.column(id);

    return values ? [{ id, values, tone: TONES[Math.min(i, TONES.length - 1)] }] : [];
  });

  return (
    <div data-testid="plot" data-lines={traces.length} data-playhead={track.time(frame).toFixed(2)}>
      <TracePlot traces={traces} height={H} playhead={frame} onSeek={seek ?? undefined} />
    </div>
  );
};

export const PlotPanel: React.FC<PanelViewProps<'plot'>> = ({ panel, ctx }) => {
  const bus = useBus(ctx.bus);

  const head = bus.playhead();

  return (
    <Titled title={panel.title}>
      {head ? (
        <WholeTry ids={panel.signals.flatMap((s) => bus.expand(s))} head={head} seek={ctx.seek} />
      ) : (
        <LivePlot panel={panel} bus={bus} />
      )}
    </Titled>
  );
};
