import type { DriveCommand } from '../../sim/driveTypes';
import type { FactValue } from '../caseFacts';
import {
  BRIDGE_VERSION,
  ERROR_MAX_CHARS,
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
import { CASE_ACTIONS, type CaseAction } from './panelKinds';
import type { SignalBus } from './signalBus';
import type { SignalScope } from './signalNames';

export interface BridgeStudio {
  drive: (command: DriveCommand | null) => void;
  event: (name: string, value: FactValue) => void;
  can: (action: CaseAction) => boolean;
  fire: (action: CaseAction) => void;
  key: (key: FrameKey) => void;
}

export interface CodeBridgeOptions {
  frame: () => unknown;
  bus: SignalBus;
  scope: SignalScope;
  inputs: readonly string[];
  studio: BridgeStudio;
  onFail: (error: string) => void;
  clock?: BridgeClock;
}

export interface BridgeEnvelope {
  source: unknown;
  data: unknown;
}

export interface CodeBridge {
  receive: (e: BridgeEnvelope) => void;
  errors: () => readonly string[];
  close: () => void;
}

type PortTarget = {
  postMessage: (message: unknown, options: { targetOrigin: string; transfer: Transferable[] }) => void;
};

export const SILENT_ERROR = 'It stopped answering for 2 s.';

const MAX_ERRORS = 50;

const isAction = (name: string): name is CaseAction => (CASE_ACTIONS as readonly string[]).includes(name);

function actionReply(m: { id: number; name: string }, studio: BridgeStudio): StudioMessage {
  if (!isAction(m.name)) return { type: 'action', id: m.id, ok: false, problem: `${m.name.slice(0, 40)} is no action` };

  if (!studio.can(m.name)) return { type: 'action', id: m.id, ok: false, problem: `${m.name} can’t run now` };

  studio.fire(m.name);

  return { type: 'action', id: m.id, ok: true };
}

function budget(clock: BridgeClock) {
  let start = clock.now();
  let count = 0;

  return () => {
    if (clock.now() - start >= 1000) {
      start = clock.now();
      count = 0;
    }

    count++;

    return count - MESSAGES_PER_SECOND;
  };
}

export function openCodeBridge(o: CodeBridgeOptions): CodeBridge {
  const clock = o.clock ?? REAL_CLOCK;
  const errors: string[] = [];
  const spend = budget(clock);
  let port: MessagePort | null = null;
  let loaded = false;
  let closed = false;
  let heard = clock.now();
  let unanswered = 0;

  const post = (message: StudioMessage) => port?.postMessage(message);
  const feed = signalFeed({ bus: o.bus, scope: o.scope, post, clock });

  const note = (error: string) => {
    if (errors.length < MAX_ERRORS) errors.push(error.slice(0, ERROR_MAX_CHARS));
  };

  const close = () => {
    if (closed) return;

    closed = true;
    stopPing();
    feed.close();
    o.studio.drive(null);
    port?.close();
    port = null;
  };

  const fail = (error: string) => {
    if (closed) return;

    note(error);
    close();
    o.onFail(error);
  };

  const handlers: { [T in FrameMessage['type']]: (m: Extract<FrameMessage, { type: T }>) => void } = {
    pong: () => undefined,
    loaded: () => {
      loaded = true;
    },
    subscribe: (m) => feed.subscribe(m.id, m.names).forEach((refused) => note(`signals refused: ${refused}`)),
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
    error: (m) => (loaded ? note(m.message) : fail(m.message)),
    key: (m) => o.studio.key({ key: m.key, meta: m.meta, ctrl: m.ctrl, shift: m.shift }),
  };

  const onPortMessage = (e: MessageEvent) => {
    heard = clock.now();
    unanswered = 0;

    const over = spend();

    if (over === 1) note(`sent more than ${MESSAGES_PER_SECOND} messages a second`);

    if (over > 0) return;

    const m = readFrameMessage(e.data);

    if (typeof m === 'string') note(m);
    else (handlers[m.type] as (message: FrameMessage) => void)(m);
  };

  const stopPing = clock.every(PING_MS, () => {
    if (!port) return;

    unanswered++;

    if (unanswered >= SILENT_MS / PING_MS && clock.now() - heard >= SILENT_MS) fail(SILENT_ERROR);
    else post({ type: 'ping' });
  });

  return {
    receive(e) {
      if (closed || port || !e.source || e.source !== o.frame() || !isHello(e.data)) return;

      const channel = new MessageChannel();

      port = channel.port1;
      port.onmessage = onPortMessage;
      heard = clock.now();
      unanswered = 0;
      (e.source as PortTarget).postMessage(
        { bc: BRIDGE_VERSION, type: 'port' },
        { targetOrigin: '*', transfer: [channel.port2] },
      );
    },
    errors: () => errors,
    close,
  };
}
