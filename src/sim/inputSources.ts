import { cameraInputSource, faceInputSource, handInputSource } from '../cameras/operator/cameraSource';
import { codeDriveReading } from '../cases/console/codeDrive';
import { midiInputSource } from '../midi/midiSource';
import { phoneCommand } from '../phone/phoneDrive';
import { phoneReading } from '../phone/phoneStore';
import { voiceInputSource } from '../voice/voiceSource';
import { commandFromPad, isIdle } from './driveKeys';
import type { DriveCommand } from './driveTypes';
import { RAW_INPUT_CAP, type InputMoment, type InputRobot, type InputSource } from './inputTypes';

export type { InputMoment, InputRobot, InputSource, PointTable } from './inputTypes';

export const NAMED_INPUTS = ['camera', 'phone', 'midi', 'leader-arm', 'voice', 'policy', 'script'] as const;
export const STUDIO_INPUTS = ['phone', 'gamepad', 'keys'];
export const CAMERA_INPUTS = ['camera', ...STUDIO_INPUTS];

const IDLE: DriveCommand = { v: [0, 0, 0] };
const LIVE_MS = 500;
const sources = new Map<string, InputSource>();

let picked: { id: string; at: number; command: DriveCommand } | null = null;

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

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;

  return [...navigator.getGamepads()].find((p) => p?.connected) ?? null;
}

registerInputSource({ id: 'keys', read: ({ keys }) => keys });
registerInputSource({ id: 'code', read: codeDriveReading });
registerInputSource(cameraInputSource);
registerInputSource(handInputSource);
registerInputSource(faceInputSource);
registerInputSource(midiInputSource);
registerInputSource(voiceInputSource);

function phoneValues(): number[] | null {
  const reading = phoneReading();

  if (!reading) return null;

  const { tilt, pad, buttons } = reading;

  return [...tilt, ...(pad ?? [0, 0]), ...buttons.map(Number)];
}

function padValues(): number[] | null {
  const pad = firstPad();

  return pad ? [...pad.axes, ...pad.buttons.map((b) => b.value)] : null;
}

registerInputSource({
  id: 'phone',
  read: ({ cls }) => {
    const reading = phoneReading();

    return reading ? phoneCommand(reading, cls) : null;
  },
  raw: phoneValues,
});
registerInputSource({
  id: 'gamepad',
  read: ({ cls }) => {
    const pad = firstPad();

    return pad ? commandFromPad(pad, cls) : null;
  },
  raw: padValues,
});

export interface InputReadings {
  command: DriveCommand;
  readings: Record<string, DriveCommand | null>;
}

export function readInputs(ids: readonly string[], at: InputMoment): InputReadings {
  const readings: Record<string, DriveCommand | null> = {};

  for (const id of ids) readings[id] = sources.get(id)?.read(at) ?? null;

  const moving = ids.find((id) => {
    const reading = readings[id];

    return !!reading && !isIdle(reading);
  });
  const id = moving ?? ids.at(-1);
  const command = (id === undefined ? null : readings[id]) ?? IDLE;

  picked = id === undefined ? null : { id, at: performance.now(), command };

  return { command, readings };
}

const commandValues = ({ v, target, aux, joints }: DriveCommand): number[] => [
  ...v,
  ...(target ?? []),
  ...(aux ?? []),
  ...Object.values(joints ?? {}),
];

export function liveInput(): { id: string; values: number[] } | null {
  if (!picked || performance.now() - picked.at > LIVE_MS) return null;

  const values = sources.get(picked.id)?.raw?.() ?? commandValues(picked.command);

  return { id: picked.id, values: values.length > RAW_INPUT_CAP ? values.slice(0, RAW_INPUT_CAP) : values };
}
