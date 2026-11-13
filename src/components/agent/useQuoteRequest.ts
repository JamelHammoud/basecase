import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { MessageQuote } from '../../types/robotics';
import { focusPromptSoon } from './focusPromptSoon';

export function useQuoteRequest(
  request: MessageQuote | null,
  ctx: {
    addQuote: (quote: MessageQuote) => void;
    promptRef: RefObject<HTMLTextAreaElement | null>;
    onQuoted?: () => void;
  },
) {
  const apply = useEffectEvent((quote: MessageQuote) => {
    ctx.addQuote(quote);
    ctx.onQuoted?.();
    focusPromptSoon(ctx.promptRef, 'end');
  });

  useEffect(() => {
    if (request) apply(request);
  }, [request]);
}
