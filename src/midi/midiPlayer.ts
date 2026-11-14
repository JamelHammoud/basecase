import type { MidiEvent } from './midiMessage';

export type MidiPlayer = (time: number) => MidiEvent[];

const EPSILON = 1e-9;

export function midiPlayer(song: readonly MidiEvent[]): MidiPlayer {
  let start: number | null = null;
  let last = -Infinity;
  let next = 0;

  return (time) => {
    if (start === null || time < last) {
      start = time;
      next = 0;
    }

    last = time;

    const from = next;
    const elapsed = time - start + EPSILON;

    while (next < song.length && song[next].t <= elapsed) next += 1;

    return song.slice(from, next);
  };
}
