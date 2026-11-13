import React from 'react';
import { CloseIcon, IconButton } from '../../design-system';
import type { MessageQuote } from '../../types/robotics';
import { QuoteBlock } from './QuoteBlock';

export const DraftQuotes: React.FC<{ quotes: MessageQuote[]; onRemove: (id: string) => void }> = ({
  quotes,
  onRemove,
}) => {
  if (!quotes.length) return null;

  return (
    <div role="group" aria-label="Quotes" className="glass mb-2 rounded-[16px] animate-pop-up">
      <div className="max-h-[164px] overflow-y-auto overflow-x-hidden p-1.5 flex flex-col gap-1">
        {quotes.map((quote) => (
          <div key={quote.id} className="flex items-start gap-2 py-1 pl-2.5 pr-0.5">
            <div className="flex-1 min-w-0 py-0.5">
              <QuoteBlock quote={quote} />
            </div>
            <IconButton
              icon={<CloseIcon className="w-3.5 h-3.5" />}
              title="Remove quote"
              tooltipSide="top"
              size="xs"
              className="rounded-full shrink-0"
              onClick={() => onRemove(quote.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
