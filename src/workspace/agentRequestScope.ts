const scopes = new WeakMap<object, AbortController>();

export function agentRequestSignal(owner: object): AbortSignal {
  let scope = scopes.get(owner);

  if (!scope) {
    scope = new AbortController();
    scopes.set(owner, scope);
  }

  return scope.signal;
}

export function stopAgentRequests(owner: object) {
  agentRequestSignal(owner);
  scopes.get(owner)!.abort();
}

export function startAgentRequests(owner: object) {
  scopes.get(owner)?.abort();
  scopes.set(owner, new AbortController());
}

export function cancellableAgentRequest<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort = () => {};
  const waiting = new Promise<T>((resolve, reject) => {
    abort = () => reject(signal.reason);
    work.then(resolve, reject);

    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });

  return waiting.finally(() => signal.removeEventListener('abort', abort));
}
