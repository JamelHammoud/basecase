import React from 'react';
import { MetaLine, ProgressBar } from '../../design-system';
import type { ContextUsage } from '../../types/robotics';
import type { Money } from '../../utils/currency';
import { useMoney } from '../../utils/useMoney';
import { bigCount, bigFigures } from '../../../electron/bigCount.mjs';

const NEARLY_FULL = 0.8;

const formatCost = (usd: number, money: Money) => (money.fromUsd(usd) >= 100 ? money.whole(usd) : money.format(usd));

export const ContextStatus: React.FC<{ context: ContextUsage }> = ({ context }) => {
  const share = Math.min(1, context.used / context.size);
  const tokens = `${bigFigures(context.used)} of ${bigCount(context.size, 'token')}`;
  const money = useMoney();

  return (
    <div className="px-2.5 pt-1.5 pb-2 tabular-nums select-none">
      <div className="text-[13px] text-white/90">Context</div>
      <ProgressBar className="mt-2" share={share} tone={share >= NEARLY_FULL ? 'warning' : 'accent'} />
      <MetaLine
        className="mt-1.5 text-[12px] text-white/50"
        items={[tokens, context.costUsd !== undefined && formatCost(context.costUsd, money)]}
      />
    </div>
  );
};
