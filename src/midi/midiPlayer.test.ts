import { describe, expect, it } from 'vitest';
import { SONG_BYTES } from './fixtures/song';
import { namedMidi, type MidiEvent } from './midiMessage';
import { midiPlayer } from './midiPlayer';
import { parseMidiFile } from './smf';

const TICK = 0.02;
const song = parseMidiFile(SONG_BYTES);

function playTicks(start: number, ticks: number) {
  const play = midiPlayer(song);

  return Array.from({ length: ticks }, (_, k) => {
    const events: Array<{ k: number; name: string; value: number }> = [];

    play(start + k * TICK, (e) => events.push({ k, ...namedMidi(e)! }));

    return events;
  });
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
    const heard = (time: number) => {
      const notes: number[] = [];

      play(time, (e) => {
        if (e.kind === 'note') notes.push(e.number);
      });

      return notes;
    };

    expect(heard(10)).toEqual([60]);
    expect(heard(10.6)).toEqual([62]);
    expect(heard(10.6)).toEqual([]);
    expect(heard(0)).toEqual([60]);
    expect(heard(1.2)).toEqual([62, 64]);
  });

  it('delivers simultaneous events in source order and stays silent between events and after the end', () => {
    const events: MidiEvent[] = [
      { t: 0, kind: 'note', number: 60, value: 1, channel: 0 },
      { t: 0, kind: 'note', number: 62, value: 1, channel: 0 },
      { t: 1, kind: 'note', number: 64, value: 1, channel: 0 },
    ];
    const heard: MidiEvent[] = [];
    const play = midiPlayer(Object.freeze(events));
    const emit = (event: MidiEvent) => heard.push(event);

    play(10, emit);
    expect(heard).toEqual(events.slice(0, 2));
    play(10, emit);
    play(10.5, emit);
    expect(heard).toHaveLength(2);
    play(11 - 5e-10, emit);
    expect(heard).toEqual(events);
    expect(heard[2]).toBe(events[2]);
    play(100, emit);
    expect(heard).toHaveLength(3);
    midiPlayer([])(0, emit);
    expect(heard).toHaveLength(3);
  });

  it.each([300, 600])('matches sliced playback across %i mixed clock reads', (reads) => {
    const events: MidiEvent[] = Array.from({ length: 100 }, (_, i) => ({
      t: Math.floor(i / 3) * 0.02,
      kind: i % 2 ? 'note' : 'cc',
      number: i % 128,
      value: (i % 128) / 127,
      channel: i % 16,
    }));
    const play = midiPlayer(events);
    let start = 0;
    let last = -Infinity;
    let next = 0;

    for (let k = 0; k < reads; k += 1) {
      const time = Math.floor(k / 80) * 5 + (k % 73) * 0.02;

      if (k === 0 || time < last) {
        start = time;
        next = 0;
      }

      last = time;

      const from = next;
      const elapsed = time - start + 1e-9;

      while (next < events.length && events[next].t <= elapsed) next += 1;

      const expected = events.slice(from, next);
      const actual: MidiEvent[] = [];

      play(time, (event) => actual.push(event));
      expect(actual).toEqual(expected);
    }
  });
});
