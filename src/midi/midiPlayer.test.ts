import { describe, expect, it } from 'vitest';
import { SONG_BYTES } from './fixtures/song';
import { namedMidi } from './midiMessage';
import { midiPlayer } from './midiPlayer';
import { parseMidiFile } from './smf';

const TICK = 0.02;
const song = parseMidiFile(SONG_BYTES);

function playTicks(start: number, ticks: number) {
  const play = midiPlayer(song);

  return Array.from({ length: ticks }, (_, k) => play(start + k * TICK).map((e) => ({ k, ...namedMidi(e)! })));
}

describe('midiPlayer', () => {
  it('plays each note on its sim tick, from the first time it sees', () => {
    const notes = playTicks(3, 100)
      .flat()
      .filter((e) => e.name === 'midi');

    expect(notes.map(({ k, value }) => [k, value])).toEqual([
      [0, 60],
      [25, 62],
      [50, 64],
      [75, 65],
    ]);
  });

  it('sweeps midi.cc.1 from 0 to 1 without falling back', () => {
    const sweep = playTicks(0, 60)
      .flat()
      .filter((e) => e.name === 'midi.cc.1')
      .map((e) => e.value);

    expect(sweep).toHaveLength(11);
    expect(sweep[0]).toBe(0);
    expect(sweep.at(-1)).toBe(1);
    sweep.slice(1).forEach((value, i) => expect(value).toBeGreaterThanOrEqual(sweep[i]));
  });

  it('starts the song over when time goes backwards', () => {
    const play = midiPlayer(song);
    const heard = (time: number) => play(time).flatMap((e) => (e.kind === 'note' ? [e.number] : []));

    expect(heard(10)).toEqual([60]);
    expect(heard(10.6)).toEqual([62]);
    expect(heard(10.6)).toEqual([]);
    expect(heard(0)).toEqual([60]);
    expect(heard(1.2)).toEqual([62, 64]);
  });
});
