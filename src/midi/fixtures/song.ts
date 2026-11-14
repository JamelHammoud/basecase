const TICKS_PER_QUARTER = 480;
const TEMPO_120_BPM = 500_000;
const TEMPO_240_BPM = 250_000;
const SWEEP_STEP_TICKS = 96;
const SWEEP_STEPS = 10;

export const SONG_NOTES = [
  { note: 60, t: 0 },
  { note: 62, t: 0.5 },
  { note: 64, t: 1 },
  { note: 65, t: 1.5 },
];

export const SONG_SWEEP = Array.from({ length: SWEEP_STEPS + 1 }, (_, i) => ({
  t: i / SWEEP_STEPS,
  raw: Math.round((127 * i) / SWEEP_STEPS),
}));

export const SONG_TEMPO_CHANGE = { tick: 960, t: 1 };

export function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];

  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);

  return bytes;
}

const word = (value: number, size: number) =>
  Array.from({ length: size }, (_, i) => (value >> (8 * (size - 1 - i))) & 0xff);

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

export const midiChunk = (id: string, body: number[]) => [...ascii(id), ...word(body.length, 4), ...body];

export const midiTrack = (events: Array<[delta: number, ...bytes: number[]]>) =>
  midiChunk('MTrk', [...events.flatMap(([delta, ...bytes]) => [...variableLength(delta), ...bytes]), 0, 0xff, 0x2f, 0]);

export const midiHeader = (format: number, tracks: number, division = TICKS_PER_QUARTER) =>
  midiChunk('MThd', [...word(format, 2), ...word(tracks, 2), ...word(division, 2)]);

const tempo = (microseconds: number) => [0xff, 0x51, 3, ...word(microseconds, 3)];

const tempoTrack = midiTrack([
  [0, 0xff, 0x03, 4, ...ascii('Song')],
  [0, ...tempo(TEMPO_120_BPM)],
  [0, 0xf0, 5, 0x7e, 0x7f, 0x09, 0x01, 0xf7],
  [SONG_TEMPO_CHANGE.tick, ...tempo(TEMPO_240_BPM)],
]);

const noteTrack = midiTrack([
  [0, 0x90, 60, 100],
  [240, 60, 0],
  [240, 62, 100],
  [240, 0x80, 62, 64],
  [240, 0x90, 64, 100],
  [480, 64, 0],
  [480, 65, 100],
  [480, 65, 0],
]);

const sweepTrack = midiTrack(
  SONG_SWEEP.map(({ raw }, i): [number, ...number[]] => (i ? [SWEEP_STEP_TICKS, 1, raw] : [0, 0xb1, 1, raw])),
);

export const SONG_BYTES = new Uint8Array([...midiHeader(1, 3), ...tempoTrack, ...noteTrack, ...sweepTrack]);
