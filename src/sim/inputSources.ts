import { codeDriveReading } from '../cases/console/codeDrive';
import { phoneCommand } from '../phone/phoneDrive';
import { phoneReading } from '../phone/phoneStore';
import { commandFromPad, isIdle, type DriveClass } from './driveKeys';
import type { DriveCommand } from './driveTypes';

export interface InputMoment {
  cls: DriveClass;
  keys: DriveCommand;
}

export interface InputSource {
  id: string;
  read: (at: InputMoment) => DriveCommand | null;
}

export const NAMED_INPUTS = ['camera', 'phone', 'midi', 'leader-arm', 'voice', 'policy', 'script'] as const;
export const STUDIO_INPUTS = ['phone', 'gamepad', 'keys'];

const IDLE: DriveCommand = { v: [0, 0, 0] };
const sources = new Map<string, InputSource>();

export const registerInputSource = (source: InputSource) => {
  sources.set(source.id, source);
};

export const inputSourceIds = () => [...sources.keys()];

export const hasInputSource = (id: string) => sources.has(id);

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

registerInputSource({ id: 'keys', read: ({ keys }) => keys });
registerInputSource({ id: 'code', read: codeDriveReading });
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
