import type { DriveCommand } from '../../sim/driveTypes';
import type { FactValue } from '../caseFacts';
import { WORLD_CALLS_PER_SECOND, type WorldChange } from '../worldSet';
import {
  BRIDGE_VERSION,
  ERROR_MAX_CHARS,
  HELLO_MS,
  isHello,
  MESSAGES_PER_SECOND,
  PING_MS,
  readFrameMessage,
  SILENT_MS,
  type FrameKey,
  type FrameMessage,
  type StudioMessage,
} from './codeProtocol';
import { REAL_CLOCK, signalFeed, type BridgeClock } from './codeSignals';
import { coalescedStore, storeGetReply, storeSetReply, type BridgeStore } from './codeStore';
import { dropFrame, frameStreams, type FrameSource } from './codeStreams';
import { CASE_ACTIONS, type CaseAction } from './panelKinds';
import type { SignalBus } from './signalBus';
import type { SignalScope } from './signalNames';

export interface BridgeStudio {
  drive: (command: DriveCommand | null) => void;
  event: (name: string, value: FactValue) => void;
  can: (action: CaseAction) => boolean;
  fire: (action: CaseAction) => void;
  key: (key: FrameKey) => void;
  world: (change: WorldChange) => string | null;
  frames: FrameSource;
  store: BridgeStore;
}

export interface CodeBridgeOptions {
  frame: () => unknown;
  bus: SignalBus;
  scope: SignalScope;
  inputs: readonly string[];
  studio: BridgeStudio;
  onFail: (error: string) => void;
  clock?: BridgeClock;
  channel?: () => MessageChannel;
  firstLine?: number;
}

export interface CodeError {
  message: string;
  line?: number;
}

export interface CodeReport {
  loaded: boolean;
  failed: string | null;
  errors: CodeError[];
  logs: string[];
  refused: string[];
}

export interface BridgeEnvelope {
  source: unknown;
  data: unknown;
}

export interface CodeBridge {
  receive: (e: BridgeEnvelope) => void;
  report: () => CodeReport;
  close: () => void;
}

type PortTarget = {
  postMessage: (message: unknown, options: { targetOrigin: string; transfer: Transferable[] }) => void;
};

export const SILENT_ERROR = 'It didn’t answer.';

export const REPORT_LIMITS = { errors: 10, logs: 20, refused: 20 } as const;

const STALL_MS = 2 * PING_MS;

const isAction = (name: string): name is CaseAction => (CASE_ACTIONS as readonly string[]).includes(name);

function actionReply(m: { id: number; name: string }, studio: BridgeStudio): StudioMessage {
  if (!isAction(m.name)) return { type: 'action', id: m.id, ok: false, problem: `${m.name.slice(0, 40)} is no action` };

  if (!studio.can(m.name)) return { type: 'action', id: m.id, ok: false, problem: `${m.name} can’t run now` };

  studio.fire(m.name);

  return { type: 'action', id: m.id, ok: true };
}

function budget(clock: BridgeClock, perSecond: number) {
  let start = clock.now();
  let count = 0;

  return () => {
    if (clock.now() - start >= 1000) {
      start = clock.now();
      count = 0;
    }

    count++;

    return count - perSecond;
  };
}

function worldGate({ clock, studio, note }: { clock: BridgeClock; studio: BridgeStudio; note: (e: string) => void }) {
  const spend = budget(clock, WORLD_CALLS_PER_SECOND);

  return (change: WorldChange) => {
    const over = spend();

    if (over === 1) note(`world refused: more than ${WORLD_CALLS_PER_SECOND} calls a second`);

    if (over > 0) return;

    const refusal = studio.world(change);

    if (refusal) note(`world refused: ${refusal}`);
  };
}

function reportLog(firstLine: number) {
  const errors: CodeError[] = [];
  const logs: string[] = [];
  const refused: string[] = [];

  const keep = <T>(list: T[], item: T, limit: number) => {
    if (list.length < limit) list.push(item);
  };

  return {
    note: (error: string) => keep(refused, error.slice(0, ERROR_MAX_CHARS), REPORT_LIMITS.refused),
    thrown: (message: string, line?: number) => {
      const at = line === undefined ? undefined : line - firstLine + 1;

      keep(errors, at !== undefined && at > 0 ? { message, line: at } : { message }, REPORT_LIMITS.errors);
    },
    logged: (text: string) => keep(logs, text, REPORT_LIMITS.logs),
    lists: () => ({ errors: [...errors], logs: [...logs], refused: [...refused] }),
  };
}

export function openCodeBridge(o: CodeBridgeOptions): CodeBridge {
  const clock = o.clock ?? REAL_CLOCK;
  const log = reportLog(o.firstLine ?? 1);
  const { note, thrown } = log;
  let failed: string | null = null;
  const spend = budget(clock, MESSAGES_PER_SECOND);
  let port: MessagePort | null = null;
  let loaded = false;
  let closed = false;
  const opened = clock.now();
  let pingedAt: number | null = null;
  let lastTick = opened;
  let repinged = false;

  const post = (message: StudioMessage) => port?.postMessage(message);
  const feed = signalFeed({ bus: o.bus, scope: o.scope, post, clock });

  const postFrame = (id: number, bitmap: ImageBitmap) => {
    if (port) port.postMessage({ type: 'frame', id, bitmap } satisfies StudioMessage, [bitmap]);
    else dropFrame(bitmap);
  };

  const streams = frameStreams({ source: o.studio.frames, clock, post: postFrame, note });
  const store = coalescedStore(o.studio.store, clock);

  const world = worldGate({ clock, studio: o.studio, note });

  const storeSet = (m: { id: number; value: unknown }) => {
    const reply = storeSetReply(m, store);

    if (reply.type === 'store' && reply.problem) note(`store refused: ${reply.problem}`);

    post(reply);
  };

  const close = () => {
    if (closed) return;

    closed = true;
    stopPing();
    feed.close();
    streams.close();
    store.flush();
    o.studio.drive(null);
    port?.close();
    port = null;
  };

  const fail = (error: string, line?: number) => {
    if (closed) return;

    thrown(error, line);
    failed = error;
    close();
    o.onFail(error);
  };

  const handlers: { [T in FrameMessage['type']]: (m: Extract<FrameMessage, { type: T }>) => void } = {
    pong: () => undefined,
    loaded: () => {
      loaded = true;
    },
    subscribe: (m) => feed.subscribe(m.id, m.names).forEach((why) => note(`signals refused: ${why}`)),
    unsubscribe: (m) => feed.unsubscribe(m.id),
    drive: (m) =>
      o.inputs.includes('code')
        ? o.studio.drive(m.command)
        : note('drive refused: the console’s input doesn’t list code'),
    event: (m) => o.studio.event(m.name, m.value),
    action: (m) => {
      const reply = actionReply(m, o.studio);

      if (reply.type === 'action' && reply.problem) note(`action refused: ${reply.problem}`);

      post(reply);
    },
    error: (m) => (loaded ? thrown(m.message, m.line) : fail(m.message, m.line)),
    log: (m) => log.logged(m.text),
    key: (m) => o.studio.key({ key: m.key, meta: m.meta, ctrl: m.ctrl, shift: m.shift }),
    world: (m) => world(m.change),
    frames: (m) => streams.open(m),
    unframes: (m) => streams.stop(m.id),
    'store-get': (m) => post(storeGetReply(m.id, store)),
    'store-set': storeSet,
  };

  const onPortMessage = (e: MessageEvent) => {
    pingedAt = null;
    repinged = false;

    const over = spend();

    if (over === 1) note(`sent more than ${MESSAGES_PER_SECOND} messages a second`);

    if (over > 0) return;

    const m = readFrameMessage(e.data);

    if (typeof m === 'string') note(m);
    else (handlers[m.type] as (message: FrameMessage) => void)(m);
  };

  const ping = (now: number, late: boolean) => {
    const silent = pingedAt !== null && now - pingedAt >= SILENT_MS;

    if (silent && (!late || repinged)) {
      fail(SILENT_ERROR);

      return;
    }

    if (silent) {
      pingedAt = now;
      repinged = true;
    }

    pingedAt ??= now;
    post({ type: 'ping' });
  };

  const stopPing = clock.every(PING_MS, () => {
    const now = clock.now();
    const late = now - lastTick > STALL_MS;

    lastTick = now;

    if (!port && now - opened >= HELLO_MS) fail(SILENT_ERROR);

    if (port) ping(now, late);
  });

  return {
    receive(e) {
      if (closed || port || !e.source || e.source !== o.frame() || !isHello(e.data)) return;

      const channel = o.channel?.() ?? new MessageChannel();

      port = channel.port1;
      port.onmessage = onPortMessage;
      (e.source as PortTarget).postMessage(
        { bc: BRIDGE_VERSION, type: 'port' },
        { targetOrigin: '*', transfer: [channel.port2] },
      );
    },
    report: () => ({ loaded, failed, ...log.lists() }),
    close,
  };
}
