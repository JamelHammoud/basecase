import { emitInputEvent } from '../sim/inputEvents';
import type { InputSource } from '../sim/inputTypes';
import { closeMidiDevices, openMidiDevices } from './midiDevices';
import { namedMidi, type MidiEvent } from './midiMessage';
import { midiPlayer } from './midiPlayer';
import { parseMidiFile } from './smf';

let song: readonly MidiEvent[] = [];
let player = midiPlayer(song);

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

export const midiInputSource: InputSource = {
  id: 'midi',
  read: ({ time }) => {
    if (time !== undefined) player(time).forEach(play);

    return null;
  },
  open: () => {
    player = midiPlayer(song);
    openMidiDevices();

    return Promise.resolve(null);
  },
  close: closeMidiDevices,
};
