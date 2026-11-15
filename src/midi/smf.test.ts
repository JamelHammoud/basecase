import { describe, expect, it } from 'vitest';
import { midiChunk, midiHeader, midiTrack, SONG_BYTES, SONG_NOTES, SONG_SWEEP } from './fixtures/song';
import { namedMidi } from './midiMessage';
import { parseMidiFile } from './smf';

describe('parseMidiFile', () => {
  it('reads a format 1 song through its tempo change', () => {
    const events = parseMidiFile(SONG_BYTES);
    const notes = events.filter((e) => e.kind === 'note');
    const sweep = events.filter((e) => e.kind === 'cc');

    expect(notes.map((e) => e.number)).toEqual(SONG_NOTES.map((n) => n.note));
    notes.forEach((e, i) => expect(e.t).toBeCloseTo(SONG_NOTES[i].t, 9));
    expect(sweep.map((e) => [e.number, e.channel, e.value])).toEqual(SONG_SWEEP.map(({ raw }) => [1, 1, raw / 127]));
    sweep.forEach((e, i) => expect(e.t).toBeCloseTo(SONG_SWEEP[i].t, 9));
    expect(events.map((e) => e.t)).toEqual([...events.map((e) => e.t)].sort((a, b) => a - b));
  });

  it('reads format 0 with running status and drops a velocity 0 note-on', () => {
    const bytes = new Uint8Array([
      ...midiHeader(0, 1, 96),
      ...midiTrack([
        [0, 0x92, 48, 127],
        [96, 48, 0],
        [0, 50, 64],
        [48, 0xc2, 5],
        [48, 0x92, 52, 1],
      ]),
    ]);
    const events = parseMidiFile(bytes);

    expect(events.map((e) => [e.t, e.number, e.channel, e.value])).toEqual([
      [0, 48, 2, 1],
      [0.5, 50, 2, 64 / 127],
      [1, 52, 2, 1 / 127],
    ]);
  });

  it('refuses bytes that aren’t a MIDI file', () => {
    expect(() => parseMidiFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow();
    expect(() => parseMidiFile(new Uint8Array([...midiHeader(0, 1).slice(0, 10)]))).toThrow();
  });

  it('keeps track and event order at equal ticks across tempo changes and empty chunks', () => {
    const bytes = new Uint8Array([
      ...midiHeader(1, 4, 96),
      ...midiTrack([
        [0, 0x92, 60, 127],
        [96, 61, 127],
        [0, 62, 127],
        [96, 63, 127],
      ]),
      ...midiChunk('JUNK', [1, 2, 3]),
      ...midiTrack([]),
      ...midiTrack([
        [96, 0xff, 0x51, 3, 0x03, 0xd0, 0x90],
        [0, 0xb1, 7, 127],
      ]),
      ...midiTrack([
        [0, 0x94, 70, 127],
        [96, 71, 127],
        [96, 72, 127],
      ]),
    ]);
    const before = bytes.slice();
    const events = parseMidiFile(bytes);

    expect(events.map(({ t, number, channel }) => [t, number, channel])).toEqual([
      [0, 60, 2],
      [0, 70, 4],
      [0.5, 61, 2],
      [0.5, 62, 2],
      [0.5, 7, 1],
      [0.5, 71, 4],
      [0.75, 63, 2],
      [0.75, 72, 4],
    ]);
    expect(parseMidiFile(bytes)).toEqual(events);
    expect(bytes).toEqual(before);
  });

  it.each([300, 600])('merges %d interleaved tracks without losing local running status', (tracks) => {
    const perTrack = 16;
    const chunks = Array.from({ length: tracks }, (_, track) =>
      midiTrack(
        Array.from({ length: perTrack }, (_, event): [number, ...number[]] =>
          event ? [96, track % 128, 127] : [0, 0x90 | (track % 16), track % 128, 127],
        ),
      ),
    );
    const bytes = new Uint8Array([...midiHeader(1, tracks, 96), ...chunks.flat()]);
    const events = parseMidiFile(bytes);

    expect(events).toEqual(
      Array.from({ length: perTrack }, (_, event) =>
        Array.from({ length: tracks }, (_, track) => ({
          t: event * 0.5,
          kind: 'note',
          number: track % 128,
          value: 1,
          channel: track % 16,
        })),
      ).flat(),
    );
  });

  it('resets running status between tracks and discards a failed import’s partial events', () => {
    const bytes = new Uint8Array([
      ...midiHeader(1, 2),
      ...midiTrack([[0, 0x90, 60, 127]]),
      ...midiTrack([[0, 61, 127]]),
    ]);

    expect(() => parseMidiFile(bytes)).toThrow('A MIDI event has no status');
    expect(parseMidiFile(new Uint8Array([...midiHeader(1, 1), ...midiTrack([])]))).toEqual([]);
    expect(
      parseMidiFile(SONG_BYTES)
        .filter((event) => event.kind === 'note')
        .map((event) => event.number),
    ).toEqual(SONG_NOTES.map((note) => note.note));
  });
});

describe('namedMidi', () => {
  it('names a note by its number and a controller by its own name', () => {
    expect(namedMidi([0x90, 60, 100])).toEqual({ name: 'midi', value: 60 });
    expect(namedMidi([0x9f, 61, 0])).toBeNull();
    expect(namedMidi([0x80, 60, 64])).toBeNull();
    expect(namedMidi([0xb3, 7, 127])).toEqual({ name: 'midi.cc.7', value: 1 });
    expect(namedMidi({ kind: 'cc', number: 1, value: 0.5, channel: 0 })).toEqual({ name: 'midi.cc.1', value: 0.5 });
    expect(namedMidi({ kind: 'note', number: 64, value: 0.5, channel: 0 })).toEqual({ name: 'midi', value: 64 });
  });
});
