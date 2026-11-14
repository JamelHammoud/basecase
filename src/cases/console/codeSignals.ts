import { SIGNAL_INTERVAL_MS, type SignalValues, type StudioMessage } from './codeProtocol';
import type { SignalBus } from './signalBus';
import { signalRef, type SignalScope } from './signalNames';

export interface BridgeClock {
  now: () => number;
  every: (ms: number, run: () => void) => () => void;
  after: (ms: number, run: () => void) => () => void;
}

export const REAL_CLOCK: BridgeClock = {
  now: () => performance.now(),
  every: (ms, run) => {
    const timer = setInterval(run, ms);

    return () => clearInterval(timer);
  },
  after: (ms, run) => {
    const timer = setTimeout(run, ms);

    return () => clearTimeout(timer);
  },
};

interface FeedOptions {
  bus: SignalBus;
  scope: SignalScope;
  post: (message: StudioMessage) => void;
  clock: BridgeClock;
}

export interface SignalFeed {
  subscribe: (id: number, names: string[]) => string[];
  unsubscribe: (id: number) => void;
  close: () => void;
}

export const MAX_SUBSCRIPTIONS = 16;

function refusalOf(scope: SignalScope, name: string): string | null {
  try {
    signalRef(scope, ['number', 'labels'], true)(name, '');

    return null;
  } catch (e) {
    return (e as Error).message.trim();
  }
}

export function signalFeed({ bus, scope, post, clock }: FeedOptions): SignalFeed {
  const subs = new Map<number, string[]>();
  let stopBus: (() => void) | null = null;
  let cancel: (() => void) | null = null;
  let last = -Infinity;

  const valuesOf = (names: string[]) => {
    const out: SignalValues = {};

    for (const id of names.flatMap((n) => bus.expand(n))) {
      const value = bus.read(id);

      if (value !== undefined) out[id] = value;
    }

    return out;
  };

  const flush = () => {
    cancel = null;
    last = clock.now();

    const time = bus.read('time');

    for (const [id, names] of subs)
      post({ type: 'signals', id, time: typeof time === 'number' ? time : 0, values: valuesOf(names) });
  };

  const changed = () => {
    if (cancel || !subs.size) return;

    const wait = last + SIGNAL_INTERVAL_MS - clock.now();

    if (wait <= 0) flush();
    else cancel = clock.after(wait, flush);
  };

  return {
    subscribe(id, names) {
      const refused = names.map((n) => refusalOf(scope, n)).filter((r): r is string => r !== null);
      const kept = names.filter((n) => refusalOf(scope, n) === null);

      if (!kept.length) return refused;

      if (!subs.has(id) && subs.size >= MAX_SUBSCRIPTIONS) return [...refused, `holds ${MAX_SUBSCRIPTIONS} already`];

      subs.set(id, kept);
      stopBus ??= bus.subscribe(changed);
      changed();

      return refused;
    },
    unsubscribe: (id) => {
      subs.delete(id);
    },
    close() {
      subs.clear();
      stopBus?.();
      cancel?.();
      stopBus = null;
      cancel = null;
    },
  };
}
