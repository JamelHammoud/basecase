import React from 'react';
import { Button, MetaLine, Tooltip, ExternalLinkIcon } from '../../design-system';
import type { BomLine } from '../../utils/bom';
import { lineQty, linePacks, linkLabel } from './buyLine';
import { money } from './format';

const PRICE_CLASS = 'shrink-0 text-right text-[13px] tabular-nums rounded-md px-1.5 h-7 cursor-default';

const ListingLink: React.FC<{ line: BomLine }> = ({ line: l }) => {
  if (!l.url) return null;

  return (
    <Tooltip label={linkLabel(l)}>
      <a
        href={l.url}
        target="_blank"
        rel="noreferrer"
        aria-label={linkLabel(l)}
        className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-white/40 hover:text-white/90 hover:bg-white/[0.07] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-[opacity,color,background-color] duration-150 cursor-default"
      >
        <ExternalLinkIcon className="w-3.5 h-3.5" />
      </a>
    </Tooltip>
  );
};

const PriceControl: React.FC<{ line: BomLine; onCheck: () => void }> = ({ line: l, onCheck }) => {
  const stale = l.status === 'stale';

  if (l.record)
    return (
      <Tooltip label={`Checked ${l.record.checkedAt}${stale ? ', over 60 days ago' : ''}`}>
        <button
          type="button"
          onClick={onCheck}
          className={`${PRICE_CLASS} hover:bg-white/[0.07] ${stale ? 'text-amber-400' : 'text-white/90'}`}
        >
          {money(l.lineUsd ?? l.record.priceUsd)}
        </button>
      </Tooltip>
    );

  if (l.estimate && l.estUsd !== undefined)
    return (
      <Tooltip label={`List price at ${l.estimate.store}, ${l.estimate.seen}. Add the price you see`}>
        <button
          type="button"
          onClick={onCheck}
          className={`${PRICE_CLASS} text-white/45 hover:bg-white/[0.07] hover:text-white/75`}
        >
          ≈ {money(l.estUsd)}
        </button>
      </Tooltip>
    );

  return (
    <Button variant="secondary" size="xs" onClick={onCheck}>
      Add Price
    </Button>
  );
};

export const BuyRow: React.FC<{ line: BomLine; onCheck: () => void; onSelect: () => void }> = ({
  line: l,
  onCheck,
  onSelect,
}) => (
  <li className="group flex items-center gap-2 h-[44px] px-[7px] rounded-lg hover:bg-white/[0.04]">
    <button type="button" onClick={onSelect} className="flex-1 min-w-0 text-left cursor-default">
      <div className="text-[13px] text-white/90 truncate">{l.name}</div>
      <MetaLine
        className="text-[12px] text-white/40 tabular-nums"
        items={[lineQty(l), linePacks(l), l.warning && <span className="text-amber-400">{l.warning}</span>]}
      />
    </button>
    <ListingLink line={l} />
    <PriceControl line={l} onCheck={onCheck} />
  </li>
);
