type Values = Record<string, number | string[]>;

type Reply = { ok: boolean; problem?: string };

interface ClientWindow {
  parent: { postMessage: (message: unknown, targetOrigin: string) => void };
  addEventListener: (type: string, listener: (e: never) => void, capture?: boolean) => void;
}

interface PortMessage {
  type: string;
  id?: number;
  time?: number;
  values?: Values;
  ok?: boolean;
  problem?: string;
}

export function installCodeClient(win: ClientWindow) {
  const pending: unknown[] = [];
  const subs = new Map<number, (values: Values, time: number) => void>();
  const replies = new Map<number, (reply: Reply) => void>();
  let port: MessagePort | null = null;
  let next = 1;

  const send = (message: unknown) => {
    if (port) port.postMessage(message);
    else if (pending.length < 256) pending.push(message);
  };

  const receive = (m: PortMessage) => {
    if (m.type === 'ping') send({ type: 'pong' });

    if (m.type === 'signals') subs.get(m.id ?? 0)?.(m.values ?? {}, m.time ?? 0);

    if (m.type !== 'action') return;

    replies.get(m.id ?? 0)?.({ ok: m.ok === true, ...(m.problem ? { problem: m.problem } : {}) });
    replies.delete(m.id ?? 0);
  };

  const adopt = (e: MessageEvent) => {
    const data = e.data as { bc?: number; type?: string } | null;

    if (port || e.source !== win.parent || data?.bc !== 1 || data.type !== 'port' || !e.ports[0]) return;

    port = e.ports[0];
    port.onmessage = (m: MessageEvent) => receive(m.data as PortMessage);
    pending.splice(0).forEach((m) => port?.postMessage(m));
  };

  const errorText = (reason: unknown) => String((reason as Error | null)?.message ?? reason);

  const forwardKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();

    if (k !== 'escape' && !((e.metaKey || e.ctrlKey) && k === 'k')) return;

    e.preventDefault();
    send({ type: 'key', key: k === 'k' ? 'k' : 'Escape', meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey });
  };

  win.addEventListener('message', adopt);
  win.addEventListener('error', (e: ErrorEvent) => send({ type: 'error', message: e.message || errorText(e.error) }));
  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
    send({ type: 'error', message: errorText(e.reason) }),
  );
  win.addEventListener('keydown', forwardKey, true);
  win.addEventListener('load', () => send({ type: 'loaded' }));

  const api = Object.freeze({
    version: 1,
    signals(names: string | string[], onValue: (values: Values, time: number) => void) {
      const id = next++;

      subs.set(id, onValue);
      send({ type: 'subscribe', id, names: Array.isArray(names) ? names : [names] });

      return () => {
        subs.delete(id);
        send({ type: 'unsubscribe', id });
      };
    },
    drive(command: unknown) {
      send({ type: 'drive', command: command ?? null });
    },
    event(name: string, value: unknown = true) {
      send({ type: 'event', name, value });
    },
    action(name: string) {
      const id = next++;

      send({ type: 'action', id, name });

      return new Promise<Reply>((resolve) => replies.set(id, resolve));
    },
  });

  Object.defineProperty(win, 'basecase', { value: api });
  win.parent.postMessage({ bc: 1, type: 'hello' }, '*');
}
