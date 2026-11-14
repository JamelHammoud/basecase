import { channelMessage, type MidiEvent, type MidiMessage } from './midiMessage';

interface Cursor {
  bytes: Uint8Array;
  at: number;
}

type TrackItem = { tick: number; tempo: number } | { tick: number; message: MidiMessage };

interface TrackState {
  cursor: Cursor;
  tick: number;
  running: number;
  items: TrackItem[];
}

const DEFAULT_TEMPO = 500_000;
const META = 0xff;
const SYSEX = 0xf0;
const SYSEX_ESCAPE = 0xf7;
const END_OF_TRACK = 0x2f;
const SET_TEMPO = 0x51;
const SMPTE = 0x8000;
const ONE_DATA_BYTE = new Set([0xc0, 0xd0]);
const CHUNK_HEADER = 8;

function byte(cursor: Cursor) {
  if (cursor.at >= cursor.bytes.length) throw new Error('The MIDI file ends early');

  const value = cursor.bytes[cursor.at];

  cursor.at += 1;

  return value;
}

function word(cursor: Cursor, size: number) {
  let value = 0;

  for (let i = 0; i < size; i += 1) value = value * 256 + byte(cursor);

  return value;
}

function variable(cursor: Cursor) {
  let value = 0;

  for (let i = 0; i < 4; i += 1) {
    const next = byte(cursor);

    value = value * 128 + (next & 0x7f);

    if (next < 0x80) return value;
  }

  throw new Error('A MIDI length runs past four bytes');
}

function skip(cursor: Cursor, length: number) {
  if (cursor.at + length > cursor.bytes.length) throw new Error('The MIDI file ends early');

  cursor.at += length;
}

function chunk(cursor: Cursor) {
  const id = String.fromCharCode(byte(cursor), byte(cursor), byte(cursor), byte(cursor));
  const length = word(cursor, 4);
  const end = Math.min(cursor.at + length, cursor.bytes.length);
  const body: Cursor = { bytes: cursor.bytes.subarray(cursor.at, end), at: 0 };

  cursor.at = end;

  return { id, body };
}

function readMeta(state: TrackState) {
  const type = byte(state.cursor);
  const length = variable(state.cursor);

  if (type === END_OF_TRACK) return false;

  if (type === SET_TEMPO && length === 3) state.items.push({ tick: state.tick, tempo: word(state.cursor, 3) });
  else skip(state.cursor, length);

  return true;
}

function readChannel(state: TrackState, status: number) {
  const data1 = byte(state.cursor);
  const data2 = ONE_DATA_BYTE.has(status & 0xf0) ? 0 : byte(state.cursor);
  const message = channelMessage(status, data1, data2);

  if (message) state.items.push({ tick: state.tick, message });
}

function readEvent(state: TrackState) {
  const first = byte(state.cursor);

  if (first === META) return readMeta(state);

  if (first === SYSEX || first === SYSEX_ESCAPE) {
    skip(state.cursor, variable(state.cursor));

    return true;
  }

  const status = first >= 0x80 ? first : state.running;

  if (status < 0x80 || status >= SYSEX) throw new Error('A MIDI event has no status');

  if (first < 0x80) state.cursor.at -= 1;

  state.running = status;
  readChannel(state, status);

  return true;
}

function readTrack(cursor: Cursor): TrackItem[] {
  const state: TrackState = { cursor, tick: 0, running: 0, items: [] };

  while (cursor.at < cursor.bytes.length) {
    state.tick += variable(cursor);

    if (!readEvent(state)) break;
  }

  return state.items;
}

function clock(division: number): (ticks: number, tempo: number) => number {
  if (division & SMPTE) {
    const frames = 256 - (division >> 8);
    const perSecond = (frames === 29 ? 29.97 : frames) * (division & 0xff);

    return (ticks: number) => ticks / perSecond;
  }

  return (ticks: number, tempo: number) => (ticks * tempo) / (division * 1_000_000);
}

function timed(items: TrackItem[], division: number): MidiEvent[] {
  const span = clock(division);
  const events: MidiEvent[] = [];
  let seconds = 0;
  let tick = 0;
  let tempo = DEFAULT_TEMPO;

  for (const item of [...items].sort((a, b) => a.tick - b.tick)) {
    seconds += span(item.tick - tick, tempo);
    tick = item.tick;

    if ('tempo' in item) tempo = item.tempo;
    else events.push({ t: seconds, ...item.message });
  }

  return events;
}

export function parseMidiFile(bytes: Uint8Array): MidiEvent[] {
  const cursor: Cursor = { bytes, at: 0 };
  const head = chunk(cursor);

  if (head.id !== 'MThd' || head.body.bytes.length < 6) throw new Error('Not a MIDI file');

  const format = word(head.body, 2);

  word(head.body, 2);

  const division = word(head.body, 2);

  if (format > 2 || division === 0) throw new Error('Not a MIDI file');

  let items: TrackItem[] = [];

  while (cursor.at + CHUNK_HEADER <= bytes.length) {
    const { id, body } = chunk(cursor);

    if (id === 'MTrk') items = items.concat(readTrack(body));
  }

  return timed(items, division);
}
