import type React from 'react';
import { useEffect, useEffectEvent, useRef } from 'react';
import { hasPrimaryModifier } from '../../utils/os';
import { isTextEntry } from '../../workspace/helpers';
import type { Routines } from '../../workspace/useRoutines';

type KeyAction = 'undo' | 'redo' | 'delete' | 'run' | 'deselect';

export const OWN_EDIT_EVENT = 'own-edit';

const MENU_ECHO_MS = 300;
const MENU_ACTIONS: Record<string, KeyAction> = { undo: 'undo', redo: 'redo', delete: 'delete' };

function keyAction(e: React.KeyboardEvent): KeyAction | null {
  const key = e.key.toLowerCase();
  const mod = hasPrimaryModifier(e);

  if (isTextEntry(e.target as Element)) return null;

  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo';

  if (mod && key === 'y') return 'redo';

  if (mod && key === 'enter') return 'run';

  if (!mod && (key === 'backspace' || key === 'delete')) return 'delete';

  return key === 'escape' && !mod ? 'deselect' : null;
}

export function useRoutineKeys(routines: Routines, rootRef: React.RefObject<HTMLDivElement | null>) {
  const lastKey = useRef(0);

  const run = (action: KeyAction): boolean => {
    const { store, editor, view } = routines;
    const actions: Record<KeyAction, () => unknown> = {
      undo: store.undo,
      redo: store.redo,
      delete: editor.removeSelected,
      run: () => {
        if (view.compiled?.ok) void routines.run();
      },
      deselect: () => editor.select(null),
    };

    if (action === 'deselect' && !editor.selected) return false;

    actions[action]();

    return true;
  };

  const onMenu = useEffectEvent((e: Event) => {
    const action = MENU_ACTIONS[String((e as CustomEvent).detail)];

    const echo = performance.now() - lastKey.current < MENU_ECHO_MS;

    if (action && !echo && !isTextEntry(document.activeElement)) run(action);
  });

  useEffect(() => {
    const root = rootRef.current;
    const listener = (e: Event) => onMenu(e);

    root?.addEventListener(OWN_EDIT_EVENT, listener);

    return () => root?.removeEventListener(OWN_EDIT_EVENT, listener);
  }, [rootRef]);

  return (e: React.KeyboardEvent) => {
    const action = keyAction(e);

    if (!action || !run(action)) return;

    e.preventDefault();
    e.stopPropagation();
    lastKey.current = performance.now();
  };
}
