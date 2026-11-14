export const renamedTo = (name: string, draft: string | null, allowEmpty = false): string | null => {
  const next = draft?.trim();

  if (allowEmpty && next === '' && name !== '') return '';

  return next && next !== name ? next : null;
};
