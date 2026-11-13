export const renamedTo = (name: string, draft: string | null): string | null => {
  const next = draft?.trim();

  return next && next !== name ? next : null;
};
