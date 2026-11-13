import { useState, type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from 'react';
import { filterSlash, slashQuery, stepSlash, withSlash, type SlashCommand } from '../../agent/slashCommands';
import { focusPromptSoon } from './focusPromptSoon';

interface SlashInputs {
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  promptRef: RefObject<HTMLTextAreaElement | null>;
}

const PICK_KEYS = new Set(['Enter', 'Tab']);
const STEP: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

export function useSlashMenu({ text, setText, promptRef }: SlashInputs) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ text: '', index: 0 });
  const query = slashQuery(text);
  const items: SlashCommand[] = query === null ? [] : filterSlash(query);
  const open = items.length > 0 && dismissed !== text;
  const active = cursor.text === text ? Math.min(cursor.index, items.length - 1) : 0;

  const pick = (command: SlashCommand) => {
    const next = withSlash(text, command.name);

    setText(next);
    focusPromptSoon(promptRef, next.length);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || e.nativeEvent.isComposing) return false;

    if (e.key in STEP) {
      e.preventDefault();
      setCursor({ text, index: stepSlash(active, STEP[e.key], items.length) });

      return true;
    }

    if (!PICK_KEYS.has(e.key) || e.shiftKey) return false;

    e.preventDefault();
    pick(items[active]);

    return true;
  };

  return {
    open,
    items,
    active,
    pick,
    onKeyDown,
    close: () => setDismissed(text),
  };
}

export type SlashMenuState = ReturnType<typeof useSlashMenu>;
