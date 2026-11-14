const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'number', 'password', 'tel']);

const TAKES_ENTER =
  'button, a[href], select, textarea, input, [contenteditable="true"], [role="button"], [role="option"], [role="menuitem"], [role="switch"], [role="tab"]';

const isPlainEnter = (e: KeyboardEvent) =>
  e.key === 'Enter' && !e.repeat && !e.isComposing && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey;

function leavesEnterToSheet(target: EventTarget | null, dialog: Element) {
  if (target === document.body) return true;

  if (!(target instanceof Element) || !dialog.contains(target)) return false;

  if (target instanceof HTMLInputElement) return TEXT_TYPES.has(target.type);

  return !target.matches(TAKES_ENTER);
}

export const runsSheetAction = (e: KeyboardEvent, dialog: Element) =>
  isPlainEnter(e) && leavesEnterToSheet(e.target, dialog);
