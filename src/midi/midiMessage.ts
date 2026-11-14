export interface MidiEvent {
  t: number;
  kind: 'note' | 'cc';
  number: number;
  value: number;
  channel: number;
}

export type MidiMessage = Omit<MidiEvent, 't'>;
export type RawMidi = readonly [status: number, data1: number, data2: number];

export interface NamedMidi {
  name: string;
  value: number;
}

export const MIDI_NOTE_EVENT = 'midi';
export const midiControlEvent = (controller: number) => `midi.cc.${controller}`;

const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const DATA_MAX = 127;

export function channelMessage(status: number, data1: number, data2: number): MidiMessage | null {
  const type = status & 0xf0;
  const channel = status & 0x0f;
  const number = data1 & 0x7f;
  const value = (data2 & 0x7f) / DATA_MAX;

  if (type === NOTE_ON && value > 0) return { kind: 'note', number, value, channel };

  if (type === CONTROL_CHANGE) return { kind: 'cc', number, value, channel };

  return null;
}

export function namedMidi(input: RawMidi | MidiMessage): NamedMidi | null {
  const message = 'kind' in input ? input : channelMessage(input[0], input[1], input[2]);

  if (!message) return null;

  if (message.kind === 'note') return { name: MIDI_NOTE_EVENT, value: message.number };

  return { name: midiControlEvent(message.number), value: message.value };
}
