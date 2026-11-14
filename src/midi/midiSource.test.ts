import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onInputEvent, type InputEvent } from '../sim/inputEvents';
import { SONG_BYTES } from './fixtures/song';
import { clearMidiSong, isMidiFileName, loadMidiSong, midiInputSource } from './midiSource';

const moment = (time?: number) => ({ cls: 'rover' as const, keys: { v: [0, 0, 0] as [number, number, number] }, time });

function fakeInput() {
  const port = Object.assign(new EventTarget(), { type: 'input', state: 'connected' });

  return {
    port,
    send: (...data: number[]) =>
      port.dispatchEvent(Object.assign(new Event('midimessage'), { data: new Uint8Array(data) })),
  };
}

function fakeAccess() {
  const first = fakeInput();
  const access = Object.assign(new EventTarget(), { inputs: new Map([['first', first.port]]) });

  const connect = () => {
    const later = fakeInput();

    access.dispatchEvent(Object.assign(new Event('statechange'), { port: later.port }));

    return later;
  };

  return { access, first, connect };
}

let heard: InputEvent[] = [];
let stop = () => {};

beforeEach(() => {
  heard = [];
  stop = onInputEvent((event) => heard.push(event));
});

afterEach(() => {
  stop();
  midiInputSource.close?.();
  clearMidiSong();
  vi.unstubAllGlobals();
});

const names = () => heard.map(({ name, value }) => [name, value]);

describe('the midi input source', () => {
  it('sends every device’s messages as named events until it closes', async () => {
    const { access, first, connect } = fakeAccess();
    const requestMIDIAccess = vi.fn(() => Promise.resolve(access));

    vi.stubGlobal('navigator', { requestMIDIAccess });

    expect(await midiInputSource.open?.(null)).toBeNull();
    expect(requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
    await vi.waitFor(() => {
      first.send(0x90, 60, 90);
      expect(heard).not.toHaveLength(0);
    });

    const later = connect();

    later.send(0xb0, 1, 127);
    first.send(0x90, 61, 0);
    expect(names().at(-1)).toEqual(['midi.cc.1', 1]);

    midiInputSource.close?.();

    const count = heard.length;

    first.send(0x90, 62, 90);
    later.send(0xb0, 1, 0);
    expect(heard).toHaveLength(count);
    expect(names()[0]).toEqual(['midi', 60]);
  });

  it('opens without Web MIDI or when it’s refused', async () => {
    vi.stubGlobal('navigator', {});
    expect(await midiInputSource.open?.(null)).toBeNull();

    vi.stubGlobal('navigator', { requestMIDIAccess: () => Promise.reject(new Error('denied')) });
    expect(await midiInputSource.open?.(null)).toBeNull();
  });

  it('plays a loaded song on the frames it reads and drives nothing', async () => {
    vi.stubGlobal('navigator', {});
    loadMidiSong(SONG_BYTES);
    await midiInputSource.open?.(null);

    expect(midiInputSource.read(moment())).toBeNull();
    expect(heard).toHaveLength(0);
    expect(midiInputSource.read(moment(5))).toBeNull();
    expect(names().filter(([name]) => name === 'midi')).toEqual([['midi', 60]]);
    midiInputSource.read(moment(6.6));
    expect(names().filter(([name]) => name === 'midi')).toEqual([
      ['midi', 60],
      ['midi', 62],
      ['midi', 64],
      ['midi', 65],
    ]);
  });

  it('knows a MIDI file by its name', () => {
    expect(['song.mid', 'SONG.MIDI', 'song.midi.txt', 'mid'].map(isMidiFileName)).toEqual([true, true, false, false]);
  });
});
