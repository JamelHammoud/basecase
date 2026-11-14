import React from 'react';
import { useBus, type PanelViewProps } from '../panelContext';
import { Titled } from './PanelTitle';
import { playheadFraction, stateBands, stateRange, stateSource, timeAtFraction } from './stateBands';

const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;

export const StatesPanel: React.FC<PanelViewProps<'states'>> = ({ panel, ctx }) => {
  const bus = useBus(ctx.bus);
  const head = bus.playhead();
  const source = stateSource(bus, panel.signal);
  const range = stateRange(source, head?.end);
  const bands = stateBands(source, range);
  const seek = ctx.seek;

  if (!bands.length) return null;

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();

    seek?.(timeAtFraction(range, (e.clientX - box.left) / Math.max(box.width, 1)));
  };

  return (
    <Titled title={panel.title}>
      <div
        data-testid="states"
        data-signal={panel.signal}
        onClick={seek && onClick}
        className="relative h-[32px] rounded-[8px] bg-[#262626] overflow-hidden"
      >
        {bands.map((band) => (
          <div
            key={`${band.from}:${band.value}`}
            data-testid="state-span"
            data-value={band.value}
            className="absolute inset-y-0 flex items-center overflow-hidden px-[6px] text-[12px] text-white/90 whitespace-nowrap"
            style={{ left: percent(band.left), width: percent(band.width), background: band.fill }}
          >
            {band.named && band.value}
          </div>
        ))}
        {head && (
          <div
            data-testid="states-playhead"
            className="absolute inset-y-0 w-px bg-white/90 pointer-events-none"
            style={{ left: percent(playheadFraction(head.at, range)) }}
          />
        )}
      </div>
    </Titled>
  );
};
