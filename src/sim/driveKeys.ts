import type { V3 } from '../utils/kinematics';
import type { DriveCommand } from './driveTypes';

export type DriveClass = 'arm' | 'rover' | 'legs';

const FORWARD = new Set(['w', 'arrowup']);
const BACK = new Set(['s', 'arrowdown']);
const LEFT = new Set(['a', 'arrowleft']);
const RIGHT = new Set(['d', 'arrowright']);

export const DRIVE_KEYS = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT, 'q', 'e', ' ']);

const held = (keys: ReadonlySet<string>, group: ReadonlySet<string>) => [...group].some((k) => keys.has(k));

const axis = (positive: boolean, negative: boolean) => Number(positive) - Number(negative);

export function commandFromKeys(keys: ReadonlySet<string>, cls: DriveClass): DriveCommand {
  const forward = axis(held(keys, FORWARD), held(keys, BACK));
  const left = axis(held(keys, LEFT), held(keys, RIGHT));
  const shiftLeft = axis(keys.has('q'), keys.has('e'));

  if (cls === 'arm') return { v: [forward, left, 0], aux: [shiftLeft, Number(keys.has(' '))] };

  if (cls === 'rover') return { v: [forward, 0, left] };

  return { v: [forward, shiftLeft, left] };
}

const DEADZONE = 0.15;

const dead = (x: number) => (Math.abs(x) < DEADZONE ? 0 : x);

export interface PadState {
  axes: readonly number[];
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
}

export function commandFromPad(pad: PadState, cls: DriveClass): DriveCommand {
  const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
  const forward = -dead(ly);
  const side = -dead(lx);
  const right = -dead(rx);

  if (cls === 'arm') {
    const lift = -dead(ry);

    return { v: [forward, side, 0], aux: [lift, pad.buttons[0]?.pressed ? 1 : 0] };
  }

  if (cls === 'rover') return { v: [forward, 0, right || side] };

  return { v: [forward, side, right] };
}

export const isIdle = (c: DriveCommand) => c.v.every((x) => x === 0) && (c.aux ?? []).every((x) => x === 0);

export const mergeCommands = (keys: DriveCommand, pad: DriveCommand | null): DriveCommand =>
  pad && !isIdle(pad) ? pad : keys;

export const sameCommand = (a: DriveCommand, b: DriveCommand) => {
  const sameV = (a.v as V3).every((x, i) => x === b.v[i]);
  const sameAux = (a.aux ?? []).every((x, i) => x === b.aux?.[i]) && (a.aux?.length ?? 0) === (b.aux?.length ?? 0);
  const sameTarget =
    a.target === b.target || (!!a.target && !!b.target && a.target.every((x, i) => x === b.target?.[i]));

  return sameV && sameAux && sameTarget;
};
