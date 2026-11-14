import { afterAll, describe, expect, it } from 'vitest';
import { onInputEvent } from '../sim/inputEvents';
import { seeded } from '../utils/seeded';
import { acceptSamples, endVoiceModel, listen, loadVoiceModel, VOICE_MODEL_PATH, type VoiceModel } from './voiceModel';
import { closeVoice, feedVoice, openVoice, setVoiceWords, voiceState } from './voiceSession';
import { spotWords, type VoskResult } from './voiceSpotter';

interface Clip {
  samples: Float32Array;
  sampleRate: number;
}

interface Host {
  installVoskWorker: (model: URL) => { workers: { terminated: boolean }[]; uninstall: () => void };
  readWav: (file: URL) => Clip;
}

const load = (name: string) => import(/* @vite-ignore */ name);
const host = (await load(new URL('./voskNodeHost.mjs', import.meta.url).href)) as Host;
const vosk = host.installVoskWorker(new URL(`../../public/${VOICE_MODEL_PATH}`, import.meta.url));
const sit = host.readWav(new URL('./fixtures/sit.wav', import.meta.url));

const RATE = 16000;

function whiteNoise(seconds: number, level: number, seed: number) {
  const next = seeded(seed);

  return Float32Array.from({ length: seconds * RATE }, () => (next() * 2 - 1) * level);
}

function pinkNoise(seconds: number, level: number, seed: number) {
  const next = seeded(seed);
  const poles = [0, 0, 0];

  return Float32Array.from({ length: seconds * RATE }, () => {
    const white = next() * 2 - 1;

    poles[0] = 0.99765 * poles[0] + white * 0.099046;
    poles[1] = 0.963 * poles[1] + white * 0.2965164;
    poles[2] = 0.57 * poles[2] + white * 1.0526913;

    return (poles[0] + poles[1] + poles[2] + white * 0.1848) * level * 0.25;
  });
}

function heardUntil(word: string) {
  const heard: string[] = [];

  return new Promise<string[]>((resolve) => {
    const stop = onInputEvent(({ name, value }) => {
      if (name !== 'voice') return;

      heard.push(String(value));

      if (value !== word) return;

      stop();
      resolve(heard);
    });
  });
}

const CHUNK = RATE / 10;

function recognize(model: VoiceModel, samples: Float32Array, words: string[]) {
  const results: VoskResult[] = [];
  const replies = Math.ceil(samples.length / CHUNK) + 1;
  let replied = 0;

  return new Promise<VoskResult[]>((resolve) => {
    const recognizer = listen(model, { words, sampleRate: RATE, hear: (result) => results.push(result) });
    const count = () => {
      replied++;

      if (replied < replies) return;

      recognizer.remove();
      resolve(results);
    };

    recognizer.on('result', count);
    recognizer.on('partialresult', count);
    recognizer.on('error', count);
    acceptSamples(recognizer, samples, RATE);
  });
}

afterAll(() => {
  closeVoice();
  setVoiceWords([]);
  vosk.uninstall();
});

describe('voice keywords', () => {
  it('listens to nothing and loads no model when the Case declares no words', async () => {
    setVoiceWords([]);

    expect(await openVoice()).toBeNull();
    expect(voiceState()).toEqual({ open: true, listening: false, words: [] });
    expect(vosk.workers).toHaveLength(0);
    closeVoice();
  });

  it('spots a recorded “sit” and nothing in noise', { timeout: 20000 }, async () => {
    const model = await loadVoiceModel('http://localhost/model.tar.gz');
    const words = ['sit', 'stand'];
    const spotted = async (samples: Float32Array) =>
      (await recognize(model, samples, words)).flatMap((result) => spotWords(result, words));

    expect(sit.sampleRate).toBe(RATE);
    expect(await spotted(sit.samples)).toEqual(['sit']);

    for (const seed of [1, 2, 3]) {
      expect(await spotted(whiteNoise(2, 0.02 * seed ** 2, seed))).toEqual([]);
      expect(await spotted(pinkNoise(2, 0.02 * seed ** 2, seed))).toEqual([]);
    }

    endVoiceModel(model);
  });

  it('fires the sit event from a clip fed in place of the microphone', { timeout: 20000 }, async () => {
    setVoiceWords(['sit', 'stand']);
    feedVoice(sit.samples, sit.sampleRate);

    const heard = heardUntil('sit');

    expect(await openVoice()).toBeNull();
    expect(voiceState().listening).toBe(true);
    expect(await heard).toEqual(['sit']);

    closeVoice();

    expect(voiceState().listening).toBe(false);
    expect(vosk.workers.at(-1)?.terminated).toBe(true);
  });
});
