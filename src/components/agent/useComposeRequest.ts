import { useEffect, useEffectEvent, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { focusPromptSoon } from './focusPromptSoon';

export interface ComposeRequest {
  request: string | null;
  onDone: () => void;
}

export function useComposeRequest(
  compose: ComposeRequest | undefined,
  ctx: { setText: Dispatch<SetStateAction<string>>; promptRef: RefObject<HTMLTextAreaElement | null> },
) {
  const request = compose?.request ?? null;

  const apply = useEffectEvent((text: string) => {
    ctx.setText((draft) => (draft.startsWith(text) ? draft : text + draft));
    compose?.onDone();
    focusPromptSoon(ctx.promptRef, text.length);
  });

  useEffect(() => {
    if (request) apply(request);
  }, [request]);
}
