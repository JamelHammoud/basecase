export const JSX_PROPS = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'placeholder',
  'label',
  'alt',
  'tooltip',
  'description',
  'emptyText',
  'emptyLabel',
  'confirmLabel',
  'subtitle',
  'hint',
  'caption',
  'heading',
  'message',
]);

export const OBJECT_KEYS = new Set([
  'label',
  'title',
  'placeholder',
  'tooltip',
  'description',
  'emptyText',
  'emptyLabel',
  'confirmLabel',
  'subtitle',
  'hint',
  'caption',
  'message',
  'detail',
  'text',
  'ariaLabel',
  'aria-label',
]);

export const CALLS = new Set(['showToast', 'toastInFront', 'toast', 'notify', 'confirmAction']);

export const CALL_KEYS = new Set([...OBJECT_KEYS, 'body']);
