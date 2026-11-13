import { cameraInputSource } from '../cameras/operator/cameraSource';
import { phoneCommand } from '../phone/phoneDrive';
import { phoneReading } from '../phone/phoneStore';
import { commandFromPad, isIdle } from './driveKeys';
import type { DriveCommand } from './driveTypes';
import type { InputMoment, InputRobot, InputSource } from './inputTypes';

export type { InputMoment, InputRobot, InputSource, PointTable } from './inputTypes';

export const NAMED_INPUTS = ['camera', 'phone', 'midi', 'leader-arm', 'voice', 'policy', 'script'] as const;
export const STUDIO_INPUTS = ['phone', 'gamepad', 'keys'];
export const CAMERA_INPUTS = ['camera', ...STUDIO_INPUTS];

const IDLE: DriveCommand = { v: [0, 0, 0] };
const sources = new Map<string, InputSource>();

export const registerInputSource = (source: InputSource) => {
  sources.set(source.id, source);
};

export const inputSourceIds = () => [...sources.keys()];

export const hasInputSource = (id: string) => sources.has(id);

export async function openInputs(ids: readonly string[], robot: InputRobot): Promise<string | null> {
  const opened: InputSource[] = [];

  for (const source of ids.flatMap((id) => sources.get(id) ?? [])) {
    if (!source.open) continue;

    const refusal = await source.open(robot);

    if (refusal) {
      opened.forEach((s) => s.close?.());

      return refusal;
    }

    opened.push(source);
  }

  return null;
}

export function closeInputs(ids: readonly string[]) {
  for (const id of ids) sources.get(id)?.close?.();
}

export const posesInputs = (ids: readonly string[]) => ids.some((id) => !!sources.get(id)?.pose);

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

registerInputSource({ id: 'keys', read: ({ keys }) => keys });
registerInputSource(cameraInputSource);
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
