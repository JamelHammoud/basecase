import React from 'react';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { extent, recent, scaler } from './series';

const W = 300;
const H = 120;
const STROKES = ['#0d99ff', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.4)'];

export const PlotPanel: React.FC<PanelViewProps<'plot'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  const seconds = 'seconds' in panel && panel.seconds !== undefined ? panel.seconds : 20;
  const ids = panel.signals.flatMap((s) => ctx.bus.expand(s));
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
