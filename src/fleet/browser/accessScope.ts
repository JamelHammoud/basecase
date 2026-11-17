export function accessScope(onDenied: () => void, parent?: AbortSignal) {
  const controller = new AbortController();
  const close = () => controller.abort();

  parent?.addEventListener('abort', close, { once: true });

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (parent?.aborted) close();

    controller.signal.throwIfAborted();

    const response = await fetch(`/v1/${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    });

    controller.signal.throwIfAborted();

    if (response.status === 401 || response.status === 403) {
      close();
      onDenied();
    }

    if (!response.ok) throw new Error('Check the fields and grants.');

    const result = await response.json();

    controller.signal.throwIfAborted();

    return result;
  }

  return {
    request,
    signal: controller.signal,
    close: () => {
      parent?.removeEventListener('abort', close);
      close();
    },
  };
}
