import type { Page } from 'playwright-core';
import { robotFacts } from '../../src/cases/robotFit';
import type { FixtureRobot } from '../../src/sim/fixtures/parts';
import { buildRig } from '../../src/utils/kinematics';
import type { V3 } from './driveJudge';

export type Fault = 'none' | 'frozen-drive' | 'runaway' | 'frozen-render' | 'speed-0.5' | 'speed-2';

export interface TapState {
  fault: Fault;
  frames: number;
  dropped: number;
  rewritten: number;
}

interface Tap extends TapState {
  frame: { poses: Float64Array; stats: { time: number; effector?: V3 } | null } | null;
  last: unknown;
  frozen: Float64Array | null;
}

type TapWindow = Window & { __gateTap?: Tap };

export function installTap(fault: Fault) {
  const w = window as TapWindow;

  if (w.__gateTap) {
    w.__gateTap.fault = fault;
    w.__gateTap.frozen = null;

    return;
  }

  const tap: Tap = { fault, frames: 0, dropped: 0, rewritten: 0, frame: null, last: null, frozen: null };
  const post = Worker.prototype.postMessage;
  const handler = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage')!;
  const isStill = (msg: { v?: number[]; target?: unknown }) => !msg.target && (msg.v ?? []).every((x) => x === 0);

  w.__gateTap = tap;

  function rewrite(msg: { type?: string; value?: number; v?: number[] }): unknown {
    if (msg?.type === 'speed' && tap.fault.startsWith('speed-')) {
      tap.rewritten++;

      return { ...msg, value: (msg.value ?? 1) * Number(tap.fault.slice(6)) };
    }

    if (msg?.type !== 'command') return msg;

    if (tap.fault === 'frozen-drive') {
      tap.dropped++;

      return null;
    }

    if (tap.fault === 'runaway' && isStill(msg) && tap.last) {
      tap.rewritten++;

      return tap.last;
    }

    if (!isStill(msg)) tap.last = msg;

    return msg;
  }

  Worker.prototype.postMessage = function (this: Worker, msg: unknown, options?: StructuredSerializeOptions) {
    const sent = rewrite(msg as { type?: string });

    if (sent !== null) post.call(this, sent, options);
  } as typeof Worker.prototype.postMessage;

  function freeze(poses: Float64Array) {
    tap.frozen ??= poses.slice();

    if (tap.frozen.length !== poses.length) return;

    poses.set(tap.frozen);
    tap.rewritten++;
  }

  function seen(data: { type?: string; poses?: Float64Array }) {
    if (data?.type !== 'frame' || !data.poses) return;

    if (tap.fault === 'frozen-render') freeze(data.poses);

    tap.frames++;
    tap.frame = data as Tap['frame'];
  }

  Object.defineProperty(Worker.prototype, 'onmessage', {
    configurable: true,
    enumerable: handler.enumerable,
    get(this: Worker) {
      return handler.get!.call(this);
    },
    set(this: Worker, fn: ((ev: MessageEvent) => unknown) | null) {
      const wrapped =
        typeof fn === 'function'
          ? function (this: Worker, ev: MessageEvent) {
              seen(ev.data);

              return fn.call(this, ev);
            }
          : fn;

      handler.set!.call(this, wrapped);
    },
  });
}

export const tapState = (page: Page) =>
  page.evaluate(() => {
    const tap = (window as TapWindow).__gateTap;

    return tap ? { fault: tap.fault, frames: tap.frames, dropped: tap.dropped, rewritten: tap.rewritten } : null;
  });

export interface RenderedFrame {
  poses: number[];
  effector: V3 | null;
  time: number;
  bodies: string[][];
}

export const renderedFrame = (page: Page): Promise<RenderedFrame | null> =>
  page.evaluate(() => {
    const frame = (window as TapWindow).__gateTap?.frame;
    const studio = (window as unknown as { __studio?: { simState: () => { bodies?: Array<{ parts: string[] }> } } })
      .__studio;

    if (!frame) return null;

    return {
      poses: Array.from(frame.poses),
      effector: frame.stats?.effector ?? null,
      time: frame.stats?.time ?? Number.NaN,
      bodies: studio?.simState().bodies?.map((b) => b.parts) ?? [],
    };
  });

type Quat = [number, number, number, number];

function rotate([w, x, y, z]: Quat, v: V3): V3 {
  const t: V3 = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];

  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
}

export interface HandSpec {
  part: string;
  point: V3;
  origin: V3;
}

export function handSpec(robot: FixtureRobot): HandSpec {
  const rig = buildRig(robot.joints, robot.parts);
  const hand = robotFacts(rig, robot.parts).endEffector;

  if (!hand) throw new Error(`${robot.id} has no end effector`);

  const owner = rig.ownerOf.get(hand.part);
  const origin = rig.joints.find((j) => j.id === owner)?.origin ?? [0, 0, 0];

  return { part: hand.part, point: hand.point as V3, origin: origin as V3 };
}

export function renderedHand(frame: RenderedFrame, spec: HandSpec): V3 {
  const body = frame.bodies.findIndex((parts) => parts.includes(spec.part));

  if (body < 0) throw new Error(`No simulated body carries ${spec.part}`);

  const [px, py, pz, qw, qx, qy, qz] = frame.poses.slice(body * 7, body * 7 + 7);
  const local: V3 = [spec.point[0] - spec.origin[0], spec.point[1] - spec.origin[1], spec.point[2] - spec.origin[2]];
  const turned = rotate([qw, qx, qz, -qy], local);

  return [px * 1000 + turned[0], pz * 1000 + turned[1], -py * 1000 + turned[2]];
}

export function maxBodyTravelMm(start: RenderedFrame, end: RenderedFrame): number {
  const bodies = Math.min(start.poses.length, end.poses.length) / 7;
  let most = 0;

  for (let b = 0; b < bodies; b++) {
    const d = [0, 1, 2].map((k) => end.poses[b * 7 + k] - start.poses[b * 7 + k]);

    most = Math.max(most, Math.hypot(d[0], d[1], d[2]) * 1000);
  }

  return most;
}
