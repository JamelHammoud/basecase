import React from 'react';
import type { Playhead } from '../../../cases/console/signalBus';
import { TracePlot, type Trace } from '../../../design-system';
import { useBus, type PanelContext, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { extent, recent, scaler } from './series';

const W = 300;
const H = 120;
const STROKES = ['#0d99ff', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.4)'];
const TONES: Trace['tone'][] = ['accent', 'primary', 'muted'];

interface WholeProps {
  ids: string[];
  ctx: PanelContext;
  head: Playhead;
}

const WholeTry: React.FC<WholeProps> = ({ ids, ctx, head }) => {
  const traces: Trace[] = ids.map((id, i) => ({
    id,
    values: ctx.bus.series(id).v,
    tone: TONES[Math.min(i, TONES.length - 1)],
  }));
  const times = ctx.bus.series(ids[0] ?? '').t;

  return (
    <div data-testid="plot" data-lines={ids.length} data-playhead={head.at.toFixed(2)}>
      <TracePlot
        traces={traces}
        height={H}
        playhead={head.frame}
        onSeek={ctx.seek && ((sample) => ctx.seek?.(times[sample] ?? 0))}
      />
    </div>
  );
};

export const PlotPanel: React.FC<PanelViewProps<'plot'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  const ids = panel.signals.flatMap((s) => ctx.bus.expand(s));
  const head = ctx.bus.playhead();

  if (head)
    return (
      <Titled title={panel.title}>
        <WholeTry ids={ids} ctx={ctx} head={head} />
      </Titled>
    );

  const seconds = 'seconds' in panel && panel.seconds !== undefined ? panel.seconds : 20;
  const lines = ids.map((id) => ({ id, s: recent(ctx.bus.series(id), seconds) }));
  const end = Math.max(0, ...lines.map((l) => l.s.t.at(-1) ?? 0));
  const x = scaler([end - seconds, end], [0, W]);
  const y = scaler(extent(lines.flatMap((l) => l.s.v)), [H, 0]);

  return (
    <Titled title={panel.title}>
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
    </Titled>
  );
};
