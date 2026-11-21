import type { MidiEvent } from './midiMessage';

export type MidiPlayer = (time: number, emit: (event: MidiEvent) => void) => void;

const EPSILON = 1e-9;

export function midiPlayer(song: readonly MidiEvent[]): MidiPlayer {
  let start: number | null = null;
  let last = -Infinity;
  let next = 0;

  return (time, emit) => {
    if (start === null || time < last) {
      start = time;
      next = 0;
    }

    last = time;

    const from = next;
    const elapsed = time - start + EPSILON;

    while (next < song.length && song[next].t <= elapsed) next += 1;

    const end = next;

    for (let i = from; i < end; i += 1) emit(song[i]);
  };
}
