import React from 'react';
import type { Bed } from '../../print/bed';
import type { PlanItem } from '../../print/plan';

export const PlateMap: React.FC<{ bed: Bed; items: PlanItem[] }> = ({ bed, items }) => (
  <svg
    viewBox={`0 0 ${bed.width} ${bed.depth}`}
    aria-hidden
    className="w-full h-full p-[5px]"
    preserveAspectRatio="xMidYMid meet"
  >
    <rect width={bed.width} height={bed.depth} rx={bed.width * 0.06} className="fill-white/[0.07]" />
    {items.map((item) => (
      <rect
        key={`${item.id}#${item.copy}`}
        x={item.x}
        y={bed.depth - item.y - item.d}
        width={item.w}
        height={item.d}
        rx={bed.width * 0.015}
        className="fill-white/50"
      />
    ))}
  </svg>
);
