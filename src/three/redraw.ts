const listeners = new Set<() => void>();

export function requestRedraw(): void {
  listeners.forEach((listener) => listener());
}

export function onRedraw(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
