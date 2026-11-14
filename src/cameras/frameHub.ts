import type { CodeFrameStream } from './codeFrameTypes';
import { frameSpec, type FrameSpec } from './frameStreams';

export interface FrameSink {
  stream: (id: string, request: { key: string } & FrameSpec, port: MessagePort) => void;
  unstream: (id: string) => void;
}

export interface FrameHubRequest {
  key: string;
  width: number;
  height: number;
  fps: number;
}

interface Entry {
  key: string;
  spec: FrameSpec;
  held: MessagePort | null;
  sink: FrameSink | null;
}

export interface FrameHub {
  open: (request: FrameHubRequest) => CodeFrameStream;
  attach: (sink: FrameSink | null) => void;
  subscribe: (listener: () => void) => () => void;
  count: () => number;
}

export function createFrameHub(): FrameHub {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let sink: FrameSink | null = null;
  let next = 0;

  const notify = () => listeners.forEach((listener) => listener());

  const hand = (id: string, entry: Entry, to: FrameSink) => {
    const port = entry.held;

    if (!port) return;

    entry.held = null;
    entry.sink = to;
    to.stream(id, { key: entry.key, ...entry.spec }, port);
  };

  const end = (id: string) => {
    const entry = entries.get(id);

    if (!entry) return;

    entries.delete(id);
    entry.held?.close();
    entry.sink?.unstream(id);
    notify();
  };

  return {
    open: ({ key, width, height, fps }) => {
      const id = `frames-${++next}`;
      const channel = new MessageChannel();
      const entry: Entry = { key, spec: frameSpec({ width, height, fps }), held: channel.port1, sink: null };

      entries.set(id, entry);

      if (sink) hand(id, entry, sink);

      notify();

      return { port: channel.port2, close: () => end(id) };
    },
    attach: (to) => {
      const ended = [...entries].filter(([, entry]) => entry.sink && entry.sink !== to);

      for (const [id] of ended) entries.delete(id);

      sink = to;

      if (to) for (const [id, entry] of entries) hand(id, entry, to);

      if (ended.length) notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    count: () => entries.size,
  };
}
