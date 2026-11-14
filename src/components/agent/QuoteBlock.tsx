import React from 'react';
import type { MessageQuote } from '../../types/robotics';

export const QuoteBlock: React.FC<{ quote: MessageQuote }> = ({ quote }) => (
  <div className="min-w-0 pl-3 border-l-2 border-white/25">
    <p className="line-clamp-3 break-words text-[13px] leading-snug text-white/60">{quote.text}</p>
    {quote.parts && <p className="mt-0.5 truncate text-[12px] text-white/50">{quote.parts}</p>}
  </div>
);
