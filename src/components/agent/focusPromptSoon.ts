import type { RefObject } from 'react';

type Caret = number | 'end' | 'keep';

const focusMovedOn = (prompt: HTMLElement, before: Element | null) => {
  const now = document.activeElement;

  return !!now && now !== document.body && now !== prompt && now !== before;
};

export function focusPromptSoon(promptRef: RefObject<HTMLTextAreaElement | null>, caret: Caret = 'keep') {
  const before = document.activeElement;

  requestAnimationFrame(() => {
    const el = promptRef.current;

    if (!el || focusMovedOn(el, before)) return;

    el.focus();

    if (caret === 'keep') return;

    const at = caret === 'end' ? el.value.length : caret;

    el.setSelectionRange(at, at);
  });
}
