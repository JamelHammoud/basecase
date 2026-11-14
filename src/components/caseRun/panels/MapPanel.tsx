import React from 'react';
import type { Series } from '../../../cases/console/signalBus';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { extent, recent, scaler } from './series';

const SIZE = 240;
const MARGIN_MM = 150;
const MOST_POINTS = 600;

function pathOf(x: Series, z: Series, seconds: number) {
  const xs = recent(x, seconds);
  const zs = recent(z, seconds);
  const stride = Math.ceil(xs.v.length / MOST_POINTS);
  const kept = xs.v.flatMap((v, i) => {
    const shown = i % stride === 0 || i === xs.v.length - 1;

    return shown && Number.isFinite(v) && Number.isFinite(zs.v[i]) ? [i] : [];
  });

  return {
    xs: { t: kept.map((i) => xs.t[i]), v: kept.map((i) => xs.v[i]) },
    zs: { t: kept.map((i) => zs.t[i]), v: kept.map((i) => zs.v[i]) },
  };
}

export const MapPanel: React.FC<PanelViewProps<'map'>> = ({ panel, ctx }) => {
  useBus(ctx.bus);

  const trail = 'trail' in panel && panel.trail !== undefined ? panel.trail : 30;
  const whole = ctx.bus.playhead() !== null;
  const { xs, zs } = pathOf(ctx.bus.series('robot.x'), ctx.bus.series('robot.z'), whole ? Infinity : trail);
  const now = whole ? { x: ctx.bus.read('robot.x'), z: ctx.bus.read('robot.z') } : { x: xs.v.at(-1), z: zs.v.at(-1) };
  const objects = ctx.sim.worldParts.map((p) => ({
    id: p.id,
    x: p.position[0],
    z: p.position[2],
    w: p.dimensions.width,
    d: p.dimensions.depth,
    color: p.color,
  }));
  const allX = [...xs.v, ...objects.flatMap((o) => [o.x - o.w / 2, o.x + o.w / 2])];
  const allZ = [...zs.v, ...objects.flatMap((o) => [o.z - o.d / 2, o.z + o.d / 2])];
  const [x0, x1] = extent(allX, 0);
  const [z0, z1] = extent(allZ, 0);
  const span = Math.max(x1 - x0, z1 - z0) + MARGIN_MM * 2;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const px = scaler([cx - span / 2, cx + span / 2], [0, SIZE]);
  const pz = scaler([cz - span / 2, cz + span / 2], [0, SIZE]);
  const k = SIZE / span;
  const at = typeof now.x === 'number' && typeof now.z === 'number' ? { x: px(now.x), z: pz(now.z) } : null;

  return (
    <Titled title={panel.title}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full aspect-square block rounded-[10px] bg-[#1a1a1a]"
        data-testid="map"
        data-objects={objects.length}
        data-path={xs.v.length}
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
        <polyline
          fill="none"
          stroke="rgba(13,153,255,0.5)"
          strokeWidth={1.5}
          points={xs.v.map((v, i) => `${px(v).toFixed(1)},${pz(zs.v[i] ?? 0).toFixed(1)}`).join(' ')}
        />
        {at && <circle cx={at.x} cy={at.z} r={5} fill="#0d99ff" data-testid="map-robot" />}
      </svg>
    </Titled>
  );
};
