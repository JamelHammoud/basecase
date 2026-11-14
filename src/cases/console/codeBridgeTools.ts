import {
  CODE_FRAME_DEFAULT,
  CODE_FRAME_MAX,
  frameHeight,
  MAX_FRAME_STREAMS,
  type CodeFrameStream,
  type OpenCodeFrames,
} from '../../cameras/codeFrameTypes';
import type { WorldChange } from '../../sim/worldLooks';
import { storeWith, type CaseStore } from '../caseStore';
import type { WorldObject } from '../schema';
import type { FrameMessage, StudioMessage } from './codeProtocol';
import type { BridgeClock } from './codeSignals';
import { WORLD_CALLS_PER_SECOND, worldRefusal } from './codeWorld';

export interface BridgeWorld {
  objects: () => readonly WorldObject[];
  set: (change: WorldChange) => string | void;
}

export interface BridgeStore {
  read: () => CaseStore | undefined;
  write: (next: CaseStore) => void;
}

export interface BridgeTools {
  world?: BridgeWorld;
  store?: BridgeStore;
  frames?: OpenCodeFrames;
}

interface ToolsInput {
  tools: BridgeTools;
  clock: BridgeClock;
  post: (message: StudioMessage, transfer?: Transferable[]) => void;
  note: (refusal: string) => void;
}

type Of<T extends FrameMessage['type']> = Extract<FrameMessage, { type: T }>;

const MIN_WIDTH = 16;

const clampWidth = (width: number | undefined) =>
  Math.max(MIN_WIDTH, Math.min(CODE_FRAME_MAX.width, Math.round(width ?? CODE_FRAME_DEFAULT.width)));

export const STORE_WRITES_PER_SECOND = 20;

function perSecond(clock: BridgeClock, limit: number) {
  let start = clock.now();
  let calls = 0;

  return () => {
    if (clock.now() - start >= 1000) {
      start = clock.now();
      calls = 0;
    }

    calls++;

    return calls - limit;
  };
}

export function bridgeTools({ tools, clock, post, note }: ToolsInput) {
  const streams = new Map<number, CodeFrameStream>();
  const spend = perSecond(clock, WORLD_CALLS_PER_SECOND);
  const spendWrite = perSecond(clock, STORE_WRITES_PER_SECOND);

  const world = ({ change }: Of<'world'>) => {
    const over = spend();

    if (over === 1) note(`world.set refused: more than ${WORLD_CALLS_PER_SECOND} calls a second`);

    if (over > 0) return;

    const world = tools.world;
    const refusal = world
      ? (worldRefusal(change, world.objects()) ?? world.set(change))
      : 'this Case has no world here';

    if (refusal) note(`world.set refused: ${refusal}`);
  };

  const refuseFrames = (id: number, problem: string) => {
    note(`frames refused: ${problem}`);
    post({ type: 'frames', id, ok: false, problem });
  };

  const frames = (m: Of<'frames'>) => {
    if (streams.has(m.id) || streams.size >= MAX_FRAME_STREAMS)
      return refuseFrames(m.id, `at most ${MAX_FRAME_STREAMS} camera streams a panel`);

    const width = clampWidth(m.width);
    const height = frameHeight(width);
    const fps = Math.min(CODE_FRAME_MAX.fps, m.fps ?? CODE_FRAME_DEFAULT.fps);
    const stream = tools.frames?.({ camera: m.camera, width, height, fps }) ?? 'no camera feed here';

    if (typeof stream === 'string') return refuseFrames(m.id, stream);

    streams.set(m.id, stream);
    post({ type: 'frames', id: m.id, ok: true, width, height, fps }, [stream.port]);
  };

  const unframes = ({ id }: Of<'unframes'>) => {
    streams.get(id)?.close();
    streams.delete(id);
  };

  const storeGet = ({ id, key }: Of<'store-get'>) => {
    const value = tools.store?.read()?.[key];

    post({ type: 'store', id, ok: true, ...(value === undefined ? {} : { value: structuredClone(value) }) });
  };

  const storeSet = ({ id, key, value }: Of<'store-set'>) => {
    const over = spendWrite();

    if (over === 1) note(`store.set refused: more than ${STORE_WRITES_PER_SECOND} writes a second`);

    if (over > 0) {
      post({ type: 'store', id, ok: false, problem: `Write at most ${STORE_WRITES_PER_SECOND} times a second.` });

      return;
    }

    const next = tools.store ? storeWith(tools.store.read(), key, value) : 'isn’t available here';

    if (typeof next === 'string') {
      note(`store.set refused: the store ${next}`);
      post({ type: 'store', id, ok: false, problem: `The store ${next}.` });

      return;
    }

    tools.store?.write(next);
    post({ type: 'store', id, ok: true });
  };

  return {
    handlers: { world, frames, unframes, 'store-get': storeGet, 'store-set': storeSet },
    close: () => {
      streams.forEach((s) => s.close());
      streams.clear();
    },
  };
}
