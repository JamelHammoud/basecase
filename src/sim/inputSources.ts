import { cameraInput } from '../cameras/operator/cameraInput';
import { phoneCommand } from '../phone/phoneDrive';
import { phoneReading } from '../phone/phoneStore';
import type { PointOf } from '../utils/animationGoals';
import type { Rig } from '../utils/kinematics';
import type { RobotDrive } from './drive';
import { commandFromPad, isIdle, type DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';

export interface InputMoment {
  cls: DriveClass;
  keys: DriveCommand;
}

export interface InputRobot {
  cls: DriveClass;
  setup?: RobotDrive;
  rig: Rig;
  pointOf: PointOf;
  changed: () => void;
}

export interface InputSource {
  id: string;
  read: (at: InputMoment) => DriveCommand | null;
  body?: boolean;
  open?: (robot: InputRobot) => Promise<void>;
  close?: () => void;
}

export const NAMED_INPUTS = ['camera', 'phone', 'midi', 'leader-arm', 'voice', 'policy', 'script'] as const;
export const STUDIO_INPUTS = ['phone', 'gamepad', 'keys'];
export const CAMERA_INPUTS = ['camera', 'keys'];

const IDLE: DriveCommand = { v: [0, 0, 0] };
const sources = new Map<string, InputSource>();

export const registerInputSource = (source: InputSource) => {
  sources.set(source.id, source);
};

export const inputSourceIds = () => [...sources.keys()];

export const hasInputSource = (id: string) => sources.has(id);

export const drivesBody = (ids: readonly string[]) => ids.some((id) => sources.get(id)?.body);

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

registerInputSource({ id: 'keys', read: ({ keys }) => keys });
registerInputSource({
  id: 'phone',
  read: ({ cls }) => {
    const reading = phoneReading();

    return reading ? phoneCommand(reading, cls) : null;
  },
});
registerInputSource({
  id: 'gamepad',
  read: ({ cls }) => {
    const pad = firstPad();

    return pad ? commandFromPad(pad, cls) : null;
  },
});
registerInputSource(cameraInput);

export function closeInputs(ids: readonly string[]) {
  for (const id of ids) sources.get(id)?.close?.();
}

export async function openInputs(ids: readonly string[], robot: InputRobot): Promise<void> {
  const opened: string[] = [];

  try {
    for (const id of ids) {
      await sources.get(id)?.open?.(robot);
      opened.push(id);
    }
  } catch (err) {
    closeInputs(opened);

    throw err;
  }
}

export interface InputReadings {
  command: DriveCommand;
  readings: Record<string, DriveCommand | null>;
}

export function readInputs(ids: readonly string[], at: InputMoment): InputReadings {
  const readings: Record<string, DriveCommand | null> = {};

  for (const id of ids) readings[id] = sources.get(id)?.read(at) ?? null;

  const moving = ids.map((id) => readings[id]).find((c): c is DriveCommand => !!c && !isIdle(c));

  return { command: moving ?? readings[ids.at(-1) ?? ''] ?? IDLE, readings };
}
