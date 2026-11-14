const listeners = new Set<() => void>();
let errors: Readonly<Record<string, string>> = {};

export const visionErrors = () => errors;

export function onVisionErrors(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function setVisionError(camera: string, error: string | null): void {
  if ((errors[camera] ?? null) === error) return;

  const next = { ...errors };

  if (error) next[camera] = error;
  else delete next[camera];

  errors = next;
  listeners.forEach((listener) => listener());
}
