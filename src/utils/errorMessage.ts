const WRAPPERS = /^(Error invoking remote method '[^']+':\s*)?(Error:\s*)*/;

const ownMessage = (err: unknown) => {
  if (err instanceof Error) return err.message;

  const message = (err as { message?: unknown } | null | undefined)?.message;

  if (typeof message === 'string') return message;

  return err == null ? '' : String(err);
};

export const errorMessage = (err: unknown): string => ownMessage(err).replace(WRAPPERS, '');
