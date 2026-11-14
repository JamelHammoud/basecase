type Values = Record<string, number | string[]>;

type Reply = { ok: boolean; problem?: string };

type ConsoleLike = Record<string, unknown>;

interface ClientWindow {
  parent: { postMessage: (message: unknown, targetOrigin: string) => void };
  addEventListener: (type: string, listener: (e: never) => void, capture?: boolean) => void;
  console?: ConsoleLike;
}

interface PortMessage {
  type: string;
  id?: number;
  time?: number;
  values?: Values;
  ok?: boolean;
  problem?: string;
  bitmap?: ImageBitmap;
  json?: string | null;
}

interface WorldSet {
  pose?: { position?: number[]; rotation?: number[] };
  visible?: boolean;
  color?: string;
}

type ConsoleForwarder = (win: ClientWindow, send: (message: unknown) => void) => void;

export function forwardConsole(win: ClientWindow, send: (message: unknown) => void) {
  const lineText = (value: unknown) => {
    if (typeof value === 'string') return value;

    if (value instanceof Error) return value.message;

    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  };

  let logged = 0;

  const forward = (level: string) => {
    const original = win.console?.[level];

    if (!win.console || typeof original !== 'function') return;

    win.console[level] = (...args: unknown[]) => {
      if (logged++ < 20)
        send({ type: 'log', text: `${level === 'log' ? '' : `${level}: `}${args.map(lineText).join(' ')}` });

      (original as (...a: unknown[]) => void).apply(win.console, args);
    };
  };

  ['log', 'info', 'warn', 'error', 'debug'].forEach(forward);
}

export function installCodeClient(win: ClientWindow, forwardLogs: ConsoleForwarder) {
  const pending: unknown[] = [];
  const subs = new Map<number, (values: Values, time: number) => void>();
  const replies = new Map<number, (m: PortMessage) => void>();
  const streams = new Map<number, (bitmap: ImageBitmap) => void>();
  let port: MessagePort | null = null;
  let next = 1;

  const send = (message: unknown) => {
    if (port) port.postMessage(message);
    else if (pending.length < 256) pending.push(message);
  };

  const deliver = (m: PortMessage) => {
    const onFrame = streams.get(m.id ?? 0);

    if (onFrame && m.bitmap) onFrame(m.bitmap);
    else m.bitmap?.close?.();
  };

  const receive = (m: PortMessage) => {
    if (m.type === 'ping') send({ type: 'pong' });

    if (m.type === 'signals') subs.get(m.id ?? 0)?.(m.values ?? {}, m.time ?? 0);

    if (m.type === 'frame') deliver(m);

    if (m.type !== 'action' && m.type !== 'store') return;

    replies.get(m.id ?? 0)?.(m);
    replies.delete(m.id ?? 0);
  };

  const replyOf = (m: PortMessage): Reply => ({ ok: m.ok === true, ...(m.problem ? { problem: m.problem } : {}) });

  const ask = <T>(message: Record<string, unknown>, settle: (m: PortMessage) => T) => {
    const id = next++;

    send({ ...message, id });

    return new Promise<T>((resolve, reject) =>
      replies.set(id, (m) => {
        try {
          resolve(settle(m));
        } catch (error) {
          reject(error as Error);
        }
      }),
    );
  };

  const storedValue = (m: PortMessage): unknown => {
    if (m.ok !== true) throw new Error(String(m.problem));

    return typeof m.json === 'string' ? JSON.parse(m.json) : null;
  };

  const adopt = (e: MessageEvent) => {
    const data = e.data as { bc?: number; type?: string } | null;

    if (port || e.source !== win.parent || data?.bc !== 2 || data.type !== 'port' || !e.ports[0]) return;

    port = e.ports[0];
    port.onmessage = (m: MessageEvent) => receive(m.data as PortMessage);
    pending.splice(0).forEach((m) => port?.postMessage(m));
  };

  const errorText = (reason: unknown) =>
    (reason == null ? '' : String((reason as Error).message ?? reason)).replace(/^(Uncaught\s+)?(\w*Error:\s*)*/, '');

  const forwardKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();

    if (k !== 'escape' && !((e.metaKey || e.ctrlKey) && k === 'k')) return;

    e.preventDefault();
    send({ type: 'key', key: k === 'k' ? 'k' : 'Escape', meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey });
  };

  forwardLogs(win, send);
  win.addEventListener('message', adopt);
  win.addEventListener('error', (e: ErrorEvent) =>
    send({
      type: 'error',
      message: errorText(e.error) || errorText(e.message),
      ...(e.lineno > 0 ? { line: e.lineno } : {}),
    }),
  );
  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
    send({ type: 'error', message: errorText(e.reason) }),
  );
  win.addEventListener('keydown', forwardKey, true);
  win.addEventListener('load', () => send({ type: 'loaded' }));

  const api = Object.freeze({
    version: 2,
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
      return ask({ type: 'action', name }, replyOf);
    },
    world: Object.freeze({
      set(name: string, change: WorldSet = {}) {
        send({ type: 'world', name, pose: change.pose, visible: change.visible, color: change.color });
      },
    }),
    store: Object.freeze({
      get: () => ask({ type: 'store-get' }, storedValue),
      set: async (value: unknown): Promise<Reply> => {
        const json: unknown = value === null ? null : JSON.stringify(value);

        if (json !== null && typeof json !== 'string') return { ok: false, problem: 'the store takes JSON' };

        return ask({ type: 'store-set', json }, replyOf);
      },
    }),
    frames(camera: string, options: { width?: number; fps?: number }, onFrame: (bitmap: ImageBitmap) => void) {
      const id = next++;

      streams.set(id, onFrame);
      send({ type: 'frames', id, camera, width: options?.width, fps: options?.fps });

      return () => {
        streams.delete(id);
        send({ type: 'unframes', id });
      };
    },
  });

  Object.defineProperty(win, 'basecase', { value: api });
  win.parent.postMessage({ bc: 2, type: 'hello' }, '*');
}
