import React from 'react';
import type { Series } from '../../../cases/console/signalBus';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { MAP_SIZE as SIZE, mapFrame } from './mapFrame';
import { recent } from './series';

export const MapPanel: React.FC<PanelViewProps<'map'>> = ({ panel, ctx }) => {
  const bus = useBus(ctx.bus);

  const playing = !!bus.playhead();
  const trail = 'trail' in panel && panel.trail !== undefined ? panel.trail : 30;
  const path = (id: string) => (playing ? bus.series(id) : recent(bus.series(id), trail));
  const xs = path('robot.x');
  const zs = path('robot.z');
  const now = (id: string, s: Series) => {
    const v = playing ? bus.read(id) : s.v.at(-1);

    return typeof v === 'number' ? v : null;
  };
  const objects = ctx.sim.worldParts.map((p) => ({
    id: p.id,
    x: p.position[0],
    z: p.position[2],
    w: p.dimensions.width,
    d: p.dimensions.depth,
    color: p.color,
  }));
  const { px, pz, k, points } = mapFrame({ xs, zs, whole: playing }, objects);
  const x = now('robot.x', xs);
  const at = x === null ? null : { x: px(x), z: pz(now('robot.z', zs) ?? 0) };

  return (
    <Titled title={panel.title}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full aspect-square block rounded-[10px] bg-[#1a1a1a]"
        data-testid="map"
        data-objects={objects.length}
        data-points={xs.v.length}
      >
        {objects.map((o) => (
          <rect
            key={o.id}
            x={px(o.x - o.w / 2)}
            y={pz(o.z - o.d / 2)}
            width={o.w * k}
            height={o.d * k}
            fill={o.color}
            opacity={0.7}
            rx={2}
          />
        ))}
        <polyline fill="none" stroke="rgba(13,153,255,0.5)" strokeWidth={1.5} points={points} />
        {at && <circle cx={at.x} cy={at.z} r={5} fill="#0d99ff" data-testid="map-robot" />}
      </svg>
    </Titled>
  );
};
