import React from 'react';
import { Button, ExternalLinkIcon, HoverCard, Tooltip } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import { type BomLine, STALE_DAYS } from '../../utils/bom';
import { scaledEntry } from '../../utils/currency';
import { dayLabel } from '../../utils/timeAgo';
import { useMoney } from '../../utils/useMoney';
import { PART_PREVIEW_WIDTH, PartPreviewCard } from '../agent/PartPreviewCard';
import type { Extra } from './buyExtras';
import { lineAmount, lineCount, linkLabel, ownedAmount } from './buyLine';
import { QtyEditor } from './QtyEditor';

export interface BuyContext {
  parts: ScenePart[];
  panScroll: boolean;
  onCheck: (line: BomLine) => void;
  onSelectParts: (ids: string[]) => void;
  extraOf: (key: string) => Extra | undefined;
  onHandOf: (key: string) => number;
  onOnHand: (line: BomLine, count: number) => void;
  onExtraQty: (key: string, qty: number) => void;
  onDeleteExtra: (line: BomLine) => void;
}

const PRICE_CLASS =
  'h-[32px] px-1.5 rounded-md text-right text-[13px] tabular-nums cursor-default transition-colors duration-150 hover:bg-white/[0.07]';

const ListingLink: React.FC<{ line: BomLine }> = ({ line: l }) => {
  if (!l.url) return null;

  return (
    <Tooltip
      label={linkLabel(l)}
      className="absolute right-0 top-px opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity duration-150"
    >
      <a
        href={l.url}
        target="_blank"
        rel="noreferrer"
        aria-label={linkLabel(l)}
        className="w-[28px] h-[28px] rounded-lg flex items-center justify-center text-white/50 hover:text-white/90 hover:bg-white/[0.07] transition-colors duration-150 cursor-default"
      >
        <ExternalLinkIcon className="w-3.5 h-3.5" />
      </a>
    </Tooltip>
  );
};

const QuotedPrice: React.FC<{ line: BomLine }> = ({ line: l }) => {
  const money = useMoney();

  if (!l.quote || l.lineUsd === undefined) return null;

  return (
    <Tooltip label={`Checked ${dayLabel(l.quote.checkedAt)}`} className="shrink-0 -my-[5px]">
      <span
        className={`${PRICE_CLASS} inline-flex items-center ${l.status === 'stale' ? 'text-amber-400' : 'text-white/90'}`}
      >
        {money.format(l.lineUsd)}
      </span>
    </Tooltip>
  );
};

const PriceControl: React.FC<{ line: BomLine; onCheck: () => void }> = ({ line: l, onCheck }) => {
  const stale = l.status === 'stale';
  const money = useMoney();

  if (l.category === 'Printed parts') return <QuotedPrice line={l} />;

  if (l.toBuy === 0 && !l.record)
    return (
      <button type="button" onClick={onCheck} className={`${PRICE_CLASS} shrink-0 -my-[5px] text-white/90`}>
        {money.format(0)}
      </button>
    );

  if (l.record)
    return (
      <Tooltip label={`Checked ${dayLabel(l.record.checkedAt)}${stale ? `, over ${STALE_DAYS} days ago` : ''}`} className="shrink-0 -my-[5px]">
        <button
          type="button"
          onClick={onCheck}
          className={`${PRICE_CLASS} ${stale ? 'text-amber-400' : 'text-white/90'}`}
        >
          {money.format(l.lineUsd ?? l.record.priceUsd, scaledEntry(l.record.entered, l.packs ?? 1))}
        </button>
      </Tooltip>
    );

  if (l.estimate && l.estUsd !== undefined)
    return (
      <Tooltip
        label={`List price at ${l.estimate.store}, ${dayLabel(l.estimate.seen)}. Add the price you see`}
        className="shrink-0 -my-[5px]"
      >
        <button type="button" onClick={onCheck} className={`${PRICE_CLASS} text-white/50 hover:text-white/75`}>
          ≈ {money.format(l.estUsd)}
        </button>
      </Tooltip>
    );

  return (
    <Button variant="ghost" size="xs" onClick={onCheck} className="shrink-0 -my-[5px] !px-1.5">
      Add Price
    </Button>
  );
};

const LineFacts: React.FC<{ line: BomLine; note?: string }> = ({ line: l, note }) => {
  const amount = lineAmount(l);
  const owned = ownedAmount(l);

  return (
    <>
      <span className="block text-[13px] leading-[18px] text-white/90">{l.name}</span>
      {(amount || owned || l.detail || note) && (
        <span className="flex flex-wrap gap-x-[12px] text-[12px] leading-[16px] text-white/50">
          {owned && <span className="tabular-nums">{owned}</span>}
          {amount && <span className="tabular-nums">{amount}</span>}
          {l.detail && <span>{l.detail}</span>}
          {note && <span>{note}</span>}
        </span>
      )}
      {l.warning && <span className="block text-[12px] leading-[16px] text-amber-400">{l.warning}</span>}
    </>
  );
};

const LineText: React.FC<{ line: BomLine; context: BuyContext }> = ({ line: l, context }) => {
  const note = context.extraOf(l.key)?.note;

  if (!l.partIds.length)
    return (
      <div className="min-w-0 flex-1">
        <LineFacts line={l} note={note} />
      </div>
    );

  const select = (
    <button
      type="button"
      onClick={() => context.onSelectParts(l.partIds)}
      className="min-w-0 w-full text-left cursor-default"
    >
      <LineFacts line={l} note={note} />
    </button>
  );

  if (l.unit === 'g') return <div className="min-w-0 flex-1">{select}</div>;

  return (
    <HoverCard
      content={() => (
        <PartPreviewCard parts={context.parts.filter((p) => p.id === l.partIds[0])} panScroll={context.panScroll} />
      )}
      width={PART_PREVIEW_WIDTH}
      placement="below"
      className="min-w-0 flex-1"
    >
      {select}
    </HoverCard>
  );
};

const LineCount: React.FC<{ line: BomLine; context: BuyContext }> = ({ line: l, context }) => {
  const extra = context.extraOf(l.key);

  if (l.category === 'Printed parts')
    return (
      <span className="shrink-0 min-w-[28px] text-right text-[13px] leading-[14px] tabular-nums text-white/50">
        {lineCount(l)}
      </span>
    );

  return (
    <QtyEditor
      line={l}
      onHand={context.onHandOf(l.key)}
      onOnHand={(count) => context.onOnHand(l, count)}
      extra={
        extra && {
          extra,
          onQty: (qty) => context.onExtraQty(l.key, qty),
          onDelete: () => context.onDeleteExtra(l),
        }
      }
    />
  );
};

export const BuyRow: React.FC<{ line: BomLine; context: BuyContext }> = ({ line: l, context }) => (
  <li className="group relative flex items-start gap-2 py-1.5 pl-[7px] pr-[29px] rounded-lg hover:bg-white/[0.04]">
    <LineCount line={l} context={context} />
    <LineText line={l} context={context} />
    <PriceControl line={l} onCheck={() => context.onCheck(l)} />
    <ListingLink line={l} />
  </li>
);
