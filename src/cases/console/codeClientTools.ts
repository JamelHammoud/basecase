type Reply = { ok: boolean; problem?: string };

type OnFrame = (bitmap: ImageBitmap, time: number) => void;

interface ToolsIo {
  send: (message: unknown) => void;
  id: () => number;
}

export interface ToolMessage {
  type: string;
  id?: number;
  ok?: boolean;
  problem?: string;
  value?: unknown;
  width?: number;
  height?: number;
  fps?: number;
}

export function codeClientTools({ send, id }: ToolsIo) {
  const frameSubs = new Map<number, { onFrame: OnFrame; port: MessagePort | null; stopped: boolean }>();
  const storeReplies = new Map<number, (reply: Reply & { value?: unknown }) => void>();

  const adoptFrames = (m: ToolMessage, port: MessagePort | undefined) => {
    const sub = frameSubs.get(m.id ?? 0);

    if (!sub || sub.stopped || !m.ok || !port) {
      port?.close();

      return;
    }

    sub.port = port;
    port.onmessage = (e: MessageEvent) => {
      const { bitmap, time } = (e.data ?? {}) as { bitmap?: ImageBitmap; time?: number };

      if (!bitmap) return;

      try {
        sub.onFrame(bitmap, time ?? 0);
      } finally {
        bitmap.close?.();
      }
    };
  };

  const ask = (message: Record<string, unknown>) => {
    const n = id();

    send({ ...message, id: n });

    return new Promise<Reply & { value?: unknown }>((resolve) => storeReplies.set(n, resolve));
  };

  return {
    receive(m: ToolMessage, ports: readonly MessagePort[]) {
      if (m.type === 'frames') adoptFrames(m, ports[0]);

      if (m.type !== 'store') return;

      storeReplies.get(m.id ?? 0)?.({
        ok: m.ok === true,
        value: m.value,
        ...(m.problem ? { problem: m.problem } : {}),
      });
      storeReplies.delete(m.id ?? 0);
    },
    world: Object.freeze({
      set(name: string, change: unknown) {
        send({ type: 'world', name, change });
      },
    }),
    frames(camera: string, options: { width?: number; fps?: number } | undefined, onFrame: OnFrame) {
      const n = id();
      const sub = { onFrame, port: null as MessagePort | null, stopped: false };

      frameSubs.set(n, sub);
      send({ type: 'frames', id: n, camera, width: options?.width, fps: options?.fps });

      return () => {
        sub.stopped = true;
        sub.port?.close();
        frameSubs.delete(n);
        send({ type: 'unframes', id: n });
      };
    },
    store: Object.freeze({
      get: async (key: string) => (await ask({ type: 'store-get', key })).value,
      async set(key: string, value: unknown) {
        const { ok, problem } = await ask({ type: 'store-set', key, value });

        return problem ? { ok, problem } : { ok };
      },
    }),
  };
}
