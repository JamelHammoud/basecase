import { useEffect, useEffectEvent, type RefObject } from 'react';
import type { MessageQuote } from '../../types/robotics';

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
    requestAnimationFrame(() => {
      const el = ctx.promptRef.current;

      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  });

  useEffect(() => {
    if (request) apply(request);
  }, [request]);
}
