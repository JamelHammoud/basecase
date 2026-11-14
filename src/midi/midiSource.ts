import { emitInputEvent, onInputEvent, type InputEvent } from '../sim/inputEvents';
import type { InputSource } from '../sim/inputTypes';
import { closeMidiDevices, openMidiDevices } from './midiDevices';
import { MIDI_NOTE_EVENT, midiControlEvent, namedMidi, type MidiEvent } from './midiMessage';
import { midiPlayer } from './midiPlayer';
import { parseMidiFile } from './smf';

let song: readonly MidiEvent[] = [];
let player = midiPlayer(song);
let lastNote: number | null = null;
let stopLevels: (() => void) | null = null;
const controls = new Map<number, number>();
const CONTROL_PREFIX = midiControlEvent(0).slice(0, -1);

export const isMidiFileName = (name: string) => /\.midi?$/i.test(name);

export const midiSong = () => song;

export function loadMidiSong(bytes: Uint8Array): readonly MidiEvent[] {
  song = parseMidiFile(bytes);
  player = midiPlayer(song);

  return song;
}

export function clearMidiSong() {
  song = [];
  player = midiPlayer(song);
}

function play(event: MidiEvent) {
  const named = namedMidi(event);

  if (named) emitInputEvent(named.name, named.value);
}

function noteLevel({ name, value }: InputEvent) {
  if (typeof value !== 'number') return;

  if (name === MIDI_NOTE_EVENT) lastNote = value;
  else if (name.startsWith(CONTROL_PREFIX)) controls.set(Number(name.slice(CONTROL_PREFIX.length)), value);
}

function forgetLevels() {
  stopLevels?.();
  stopLevels = null;
  lastNote = null;
  controls.clear();
}

export function midiLevels(): number[] | null {
  if (lastNote === null && !controls.size) return null;

  return [lastNote ?? -1, ...[...controls].flat()];
}

export const midiInputSource: InputSource = {
  id: 'midi',
  read: ({ time }) => {
    if (time !== undefined) player(time).forEach(play);

    return null;
  },
  raw: midiLevels,
  open: () => {
    player = midiPlayer(song);
    forgetLevels();
    stopLevels = onInputEvent(noteLevel);
    openMidiDevices();

    return Promise.resolve(null);
  },
  close: () => {
    forgetLevels();
    closeMidiDevices();
  },
};
