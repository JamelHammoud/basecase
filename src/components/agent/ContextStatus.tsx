import React from 'react';
import { MetaLine } from '../../design-system';
import type { ContextUsage } from '../../types/robotics';

const NEARLY_FULL = 0.8;

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;

  if (n >= 1000) return `${+(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K`;

  return String(n);
}

const formatCost = (usd: number) => `$${usd.toFixed(usd >= 100 ? 0 : 2)}`;

export const ContextStatus: React.FC<{ context: ContextUsage }> = ({ context }) => {
  const share = Math.min(1, context.used / context.size);
  const tokens = `${formatTokens(context.used)} of ${formatTokens(context.size)} tokens`;

  return (
    <div className="px-2.5 pt-1.5 pb-2 tabular-nums select-none">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-white/90">Context</span>
        <span className="text-white/50">{Math.round(share * 100)}%</span>
      </div>
      <div className="mt-2 h-[4px] rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className={`h-full rounded-full ${share >= NEARLY_FULL ? 'bg-amber-400' : 'bg-white/55'}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <MetaLine
        className="mt-1.5 text-[12px] text-white/45"
        items={[tokens, context.costUsd !== undefined && formatCost(context.costUsd)]}
      />
    </div>
  );
};
