import { hasPrimaryModifier } from '../../utils/os';

export type LabelTool = 'select' | 'box' | 'polygon' | 'keypoint' | 'segment';
export type LabelKeyAction = LabelTool | 'next' | 'previous' | 'undo' | 'redo' | 'finish' | 'delete' | 'accept';

interface LabelKey {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function labelKeyAction(event: LabelKey): LabelKeyAction | null {
  const key = event.key.toLowerCase();

  if (hasPrimaryModifier(event) && key === 'z') return event.shiftKey ? 'redo' : 'undo';

  if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null;

  const actions: Record<string, LabelKeyAction> = {
    arrowright: 'next',
    arrowleft: 'previous',
    v: 'select',
    b: 'box',
    p: 'polygon',
    k: 'keypoint',
    s: 'segment',
    enter: 'finish',
    backspace: 'delete',
    delete: 'delete',
    a: 'accept',
  };

  return actions[key] ?? null;
}
