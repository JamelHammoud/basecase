import { cameraInputSource, faceInputSource, handInputSource } from '../cameras/operator/cameraSource';
import { codeDriveReading } from '../cases/console/codeDrive';
import { midiInputSource } from '../midi/midiSource';
import { phoneCommand } from '../phone/phoneDrive';
import { phoneReading } from '../phone/phoneStore';
import { voiceInputSource } from '../voice/voiceSource';
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

export async function openInputs(ids: readonly string[], robot: InputRobot | null): Promise<string | null> {
  const opened: InputSource[] = [];

  for (const source of ids.flatMap((id) => sources.get(id) ?? [])) {
    if (!source.open || (source.pose && !robot)) continue;

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

const padsAtLoad = () =>
  typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean).length : 0;

let padsConnected = padsAtLoad();

if (typeof window !== 'undefined') {
  window.addEventListener('gamepadconnected', () => {
    padsConnected++;
  });
  window.addEventListener('gamepaddisconnected', () => {
    padsConnected = Math.max(0, padsConnected - 1);
  });
}

function firstPad(): Gamepad | null {
  if (!padsConnected || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

registerInputSource({ id: 'keys', read: ({ keys }) => keys });
registerInputSource({ id: 'code', read: codeDriveReading });
registerInputSource(cameraInputSource);
registerInputSource(handInputSource);
registerInputSource(faceInputSource);
registerInputSource(midiInputSource);
registerInputSource(voiceInputSource);
registerInputSource({
  id: 'phone',
  read: ({ cls }) => {
    const reading = phoneReading();

    return reading ? phoneCommand(reading, cls) : null;
  },
  raw: () => {
    const reading = phoneReading();

    return reading && [...reading.tilt, ...(reading.pad ?? [0, 0]), ...reading.buttons.map((b) => (b ? 1 : 0))];
  },
});
registerInputSource({
  id: 'gamepad',
  read: ({ cls }) => {
    const pad = firstPad();

    return pad ? commandFromPad(pad, cls) : null;
  },
  raw: () => {
    const pad = firstPad();

    return pad && [...pad.axes, ...pad.buttons.map((b) => b.value)];
  },
});

const commandValues = (c: DriveCommand) => [
  ...c.v,
  ...(c.target ?? []),
  ...(c.aux ?? []),
  ...Object.values(c.joints ?? {}),
];

export interface RawInput {
  id: string;
  values: number[];
}

export function drivingInput(ids: readonly string[], readings: Record<string, DriveCommand | null>): RawInput | null {
  const id = ids.find((k) => {
    const reading = readings[k];

    return !!reading && !isIdle(reading);
  });
  const command = id && readings[id];

  return id && command ? { id, values: sources.get(id)?.raw?.() ?? commandValues(command) } : null;
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
