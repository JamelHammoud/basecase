import { emitInputEvent } from '../sim/inputEvents';
import type { Capture } from './voiceCapture';
import {
  acceptSamples,
  endVoiceModel,
  listen,
  loadVoiceModel,
  VOICE_MODEL_PATH,
  type VoiceModel,
  type VoiceRecognizer,
} from './voiceModel';
import { spotWords, type VoskResult } from './voiceSpotter';
import { uniqueWords, VOICE_FACT } from './voiceWords';

export const MICROPHONE_REFUSAL = 'Couldn’t open the microphone.';

interface Feed {
  samples: Float32Array;
  sampleRate: number;
}

interface Session {
  model: VoiceModel;
  words: readonly string[];
  capture: Capture | null;
  standIn: VoiceRecognizer | null;
}

export interface VoiceState {
  open: boolean;
  listening: boolean;
  words: readonly string[];
}

let words: readonly string[] = [];
let opened = false;
let session: Session | null = null;
let generation = 0;
let queued: Feed[] = [];

const modelUrl = () => new URL(`/${VOICE_MODEL_PATH}`, globalThis.location?.origin ?? 'http://localhost').href;

const sameWords = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((word, i) => word === b[i]);

function hear(listening: readonly string[]) {
  return (result: VoskResult) => spotWords(result, listening).forEach((word) => emitInputEvent(VOICE_FACT, word));
}

function stop() {
  generation++;

  const ending = session;

  session = null;

  if (!ending) return;

  ending.capture?.stop();
  ending.standIn?.remove();
  endVoiceModel(ending.model);
}

function pushFeed(current: Session, { samples, sampleRate }: Feed) {
  current.standIn ??= listen(current.model, { words: current.words, sampleRate, hear: hear(current.words) });
  acceptSamples(current.standIn, samples, sampleRate);
}

async function openMicrophone(model: VoiceModel, listening: readonly string[]): Promise<Capture | null> {
  const { captureMicrophone } = await import('./voiceCapture');

  return captureMicrophone({ model, words: listening, hear: hear(listening) });
}

async function start(opening: number): Promise<string | null> {
  const listening = words;
  const standIn = queued.length > 0;
  const model = await loadVoiceModel(modelUrl()).catch(() => null);

  if (model && opening !== generation) endVoiceModel(model);

  if (opening !== generation) return null;

  if (!model) return MICROPHONE_REFUSAL;

  const capture = standIn ? null : await openMicrophone(model, listening);

  if (opening !== generation) {
    capture?.stop();
    endVoiceModel(model);

    return null;
  }

  if (!standIn && !capture) {
    endVoiceModel(model);

    return MICROPHONE_REFUSAL;
  }

  const current: Session = { model, words: listening, capture, standIn: null };

  session = current;
  queued.splice(0).forEach((feed) => pushFeed(current, feed));

  return null;
}

function begin(): Promise<string | null> {
  stop();

  if (words.length === 0) {
    queued = [];

    return Promise.resolve(null);
  }

  return start(generation);
}

export function setVoiceWords(next: readonly string[]) {
  const clean = uniqueWords(next);

  if (sameWords(clean, words)) return;

  words = clean;

  if (opened) void begin();
}

export function openVoice(): Promise<string | null> {
  opened = true;

  return begin();
}

export function closeVoice() {
  opened = false;
  stop();
}

export function feedVoice(samples: Float32Array | readonly number[], sampleRate: number) {
  const feed = { samples: Float32Array.from(samples), sampleRate };

  if (session) return pushFeed(session, feed);

  queued.push(feed);
}

export const voiceState = (): VoiceState => ({ open: opened, listening: session !== null, words });
