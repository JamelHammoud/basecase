import type { DriveCommand } from '../../../sim/driveTypes';
import type { FactValue } from '../../caseFacts';
import type { StoreValue } from '../../caseStore';
import type { WorldChange } from '../../worldSet';
import { openCodeBridge, type BridgeStudio, type CodeBridge } from '../codeBridge';
import { codeClientScript } from '../codeDocument';
import type { FrameKey } from '../codeProtocol';
import type { BridgeClock } from '../codeSignals';
import type { BridgeStore } from '../codeStore';
import type { FrameSize, FrameSource } from '../codeStreams';
import type { CaseAction } from '../panelKinds';
import type { SignalBus } from '../signalBus';
import type { SignalScope } from '../signalNames';

type Listener = (e: unknown) => void;

export class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly calls: string[] = [];
  readonly tag: string;
  textContent = '';
  value = '0';
  private listeners = new Map<string, Listener[]>();

  constructor(tag: string) {
    this.tag = tag;
  }

  append(...items: FakeElement[]) {
    this.children.push(...items);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, init: Record<string, unknown> = {}) {
    this.listeners.get(type)?.forEach((l) => l({ type, target: this, ...init }));
  }

  getContext() {
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        this.calls.push(`${name}(${args.join(',')})`);

    return new Proxy({} as Record<string, unknown>, { get: (_, name) => record(String(name)), set: () => true });
  }

  find(key: string, value: string): FakeElement | undefined {
    if (this.dataset[key] === value) return this;

    return this.children.map((c) => c.find(key, value)).find(Boolean);
  }
}

export interface StudioLog {
  drives: Array<DriveCommand | null>;
  events: Array<[string, FactValue]>;
  fired: CaseAction[];
  keys: FrameKey[];
  failed: string[];
  world: WorldChange[];
  streams: Array<{ camera: string; size: FrameSize }>;
  store: StoreValue | null;
}

export interface FrameOptions {
  bus: SignalBus;
  scope: SignalScope;
  inputs?: string[];
  can?: (action: CaseAction) => boolean;
  clock?: BridgeClock;
  world?: (change: WorldChange) => string | null;
  frames?: FrameSource;
  store?: BridgeStore;
  globals?: Record<string, unknown>;
  drive?: (command: DriveCommand | null) => void;
  event?: (name: string, value: FactValue) => void;
}

export interface TestFrame {
  window: Record<string, unknown>;
  body: FakeElement;
  bridge: CodeBridge;
  log: StudioLog;
  parent: { postMessage: (data: unknown) => void };
  run: (script: string) => void;
  fire: (type: string, init: Record<string, unknown>) => void;
  hang: () => void;
  close: () => void;
}

function transferringChannel(): MessageChannel {
  const channel = new MessageChannel();
  const { port1, port2 } = channel;
  const post = port1.postMessage.bind(port1);
  const closers = [port1.close.bind(port1), port2.close.bind(port2)];
  let open = true;

  const close = () => {
    open = false;
    closers.forEach((c) => c());
  };

  const transfer = (data: unknown, moved?: unknown) => {
    if (!Array.isArray(moved) || !moved.length) {
      post(data);

      return;
    }

    queueMicrotask(() => open && port2.onmessage?.call(port2, { data } as MessageEvent));
  };

  port1.postMessage = transfer as MessagePort['postMessage'];
  port1.close = close;
  port2.close = close;

  return channel;
}

const runIn = (win: Record<string, unknown>, script: string) =>
  (new Function('window', `with (window) {\n${script}\n}`) as (w: Record<string, unknown>) => void)(win);

const scriptsOf = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

function fakeWindow(parent: object, globals: Record<string, unknown> = {}) {
  const listeners = new Map<string, Listener[]>();
  const body = new FakeElement('body');
  const win: Record<string, unknown> = {
    parent,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    document: { body, createElement: (tag: string) => new FakeElement(tag) },
    addEventListener: (type: string, l: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), l]),
    ...globals,
  };
  const dispatch = (type: string, e: Record<string, unknown>) =>
    listeners.get(type)?.forEach((l) => l({ type, preventDefault: () => undefined, ...e }));

  win.window = win;

  return { win, body, dispatch };
}

export function openTestFrame(html: string, o: FrameOptions): TestFrame {
  const log: StudioLog = {
    drives: [],
    events: [],
    fired: [],
    keys: [],
    failed: [],
    world: [],
    streams: [],
    store: null,
  };
  const ports: MessagePort[] = [];
  let bridge: CodeBridge | null = null;
  const parent = { postMessage: (data: unknown) => bridge?.receive({ source: frame.win, data }) };
  const frame = fakeWindow(parent, o.globals);

  frame.win.postMessage = (data: unknown, options: { transfer?: MessagePort[] }) => {
    ports.push(...(options.transfer ?? []));
    frame.dispatch('message', { data, source: parent, ports: options.transfer ?? [] });
  };

  const studio: BridgeStudio = {
    drive: (command) => {
      log.drives.push(command);
      o.drive?.(command);
    },
    event: (name, value) => {
      log.events.push([name, value]);
      o.event?.(name, value);
    },
    can: o.can ?? (() => true),
    fire: (action) => log.fired.push(action),
    key: (key) => log.keys.push(key),
    world: o.world ?? ((change) => (log.world.push(change), null)),
    frames:
      o.frames ??
      ((camera, size) => {
        log.streams.push({ camera, size });

        return () => undefined;
      }),
    store: o.store ?? {
      get: () => log.store,
      set: (value) => {
        log.store = value;
      },
    },
  };

  bridge = openCodeBridge({
    frame: () => frame.win,
    bus: o.bus,
    scope: o.scope,
    inputs: o.inputs ?? ['code'],
    studio,
    onFail: (error) => log.failed.push(error),
    ...(o.clock ? { clock: o.clock } : {}),
    channel: transferringChannel,
  });

  const run = (script: string) => runIn(frame.win, script);
  const opened = bridge;

  const runPanel = (script: string) => {
    try {
      run(script);
    } catch (error) {
      frame.dispatch('error', { message: `Uncaught ${String(error)}`, error });
    }
  };

  run(codeClientScript());
  scriptsOf(html).forEach(runPanel);
  frame.dispatch('load', {});

  return {
    window: frame.win,
    body: frame.body,
    bridge: opened,
    log,
    parent,
    run,
    fire: frame.dispatch,
    hang: () =>
      ports.forEach((p) => {
        p.onmessage = null;
      }),
    close: () => {
      opened.close();
      ports.forEach((p) => p.close());
    },
  };
}

export function fakeClock(): BridgeClock & { tick: (ms: number) => void; freeze: (ms: number) => void } {
  let now = 0;
  let tasks: Array<{ at: number; every: number; run: () => void; gone: boolean }> = [];

  const add = (ms: number, run: () => void, every: number) => {
    const task = { at: now + ms, every, run, gone: false };

    tasks.push(task);

    return () => {
      task.gone = true;
    };
  };

  return {
    now: () => now,
    every: (ms, run) => add(ms, run, ms),
    after: (ms, run) => add(ms, run, 0),
    tick(ms) {
      const end = now + ms;

      for (let due = tasks.find((t) => !t.gone && t.at <= end); due; due = tasks.find((t) => !t.gone && t.at <= end)) {
        now = due.at;
        due.gone = due.every === 0;
        due.at += due.every;
        due.run();
      }

      now = end;
      tasks = tasks.filter((t) => !t.gone);
    },
    freeze(ms) {
      now += ms;

      for (const due of tasks.filter((t) => !t.gone && t.at <= now)) {
        due.gone = due.every === 0;
        due.at = now + due.every;
        due.run();
      }

      tasks = tasks.filter((t) => !t.gone);
    },
  };
}
