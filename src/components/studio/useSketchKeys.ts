import type React from 'react';
import { useEffect, useEffectEvent, useRef } from 'react';
import { OWN_EDIT_EVENT } from '../routines/useRoutineKeys';
import { dimensionLabels } from './sketchMarks';
import { formatMm } from './sketchView';
import type { SketchDrawing, SketchEditor } from './useSketchDrawing';
import type { SketchSelection } from './useSketchSelection';
import type { SketchTool } from './useStudioDraft';

const DIGIT = /^[0-9.]$/;
const MENU_ECHO_MS = 300;

interface KeyOptions {
  editor: SketchEditor;
  drawing: SketchDrawing;
  selection: SketchSelection;
  tool: SketchTool | null;
  onTool: (tool: SketchTool | null) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

function useRefocus(rootRef: React.RefObject<HTMLDivElement | null>, fieldOpen: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    const lost = !document.activeElement || document.activeElement === document.body;

    if (!fieldOpen && root && lost) root.focus({ preventScroll: true });
  }, [rootRef, fieldOpen]);
}

export function useSketchKeys({ editor, drawing, selection, tool, onTool, rootRef }: KeyOptions) {
  const lastKey = useRef(0);

  useRefocus(rootRef, !!selection.editing || !!drawing.typed);

  const escape = () => {
    if (selection.editing) selection.setEditing(null);
    else if (drawing.pending) drawing.cancel();
    else if (selection.selected.length) selection.setSelected([]);
    else if (tool) onTool(null);
    else return false;

    return true;
  };

  const editSelected = (text?: string) => {
    const only = selection.selected.length === 1 ? selection.selected[0] : null;
    const label = only && dimensionLabels(editor.sketch, selection.selected, 0).find((l) => l.entity === only);

    if (!label) return false;

    selection.setEditing({ label, text: text ?? formatMm(label.value) });

    return true;
  };

  const actions: Record<string, () => boolean> = {
    undo: () => (editor.undo?.(), true),
    redo: () => (editor.redo?.(), true),
    delete: () => (selection.remove(), true),
    escape,
    enter: () => editSelected(),
  };

  const onMenu = useEffectEvent((e: Event) => {
    const action = String((e as CustomEvent).detail);
    const echo = performance.now() - lastKey.current < MENU_ECHO_MS;

    if (!echo && (action === 'undo' || action === 'redo' || action === 'delete')) actions[action]();
  });

  useEffect(() => {
    const root = rootRef.current;
    const listener = (e: Event) => onMenu(e);

    root?.addEventListener(OWN_EDIT_EVENT, listener);

    return () => root?.removeEventListener(OWN_EDIT_EVENT, listener);
  }, [rootRef]);

  const actionFor = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const mod = e.metaKey || e.ctrlKey;

    if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo';

    if (mod && key === 'y') return 'redo';

    if (mod) return null;

    return key === 'backspace' ? 'delete' : key;
  };

  return (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;

    const action = actionFor(e);
    const typed = DIGIT.test(e.key) && (drawing.startTyping(e.key) || editSelected(e.key));
    const handled = typed || (!!action && Object.hasOwn(actions, action) && actions[action]());

    if (!handled) return;

    e.preventDefault();
    e.stopPropagation();
    lastKey.current = performance.now();
  };
}
