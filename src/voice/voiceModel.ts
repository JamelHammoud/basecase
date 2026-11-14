import type { KaldiRecognizer, Model } from 'vosk-browser';
import { voiceGrammar, type VoskResult } from './voiceSpotter';

export { VOICE_MODEL_PATH } from './voiceModelPath';

export type VoiceModel = Model;
export type VoiceRecognizer = KaldiRecognizer;

export const VOICE_SAMPLE_RATE = 16000;

const QUIET = -2;
const CHUNK_SECONDS = 0.1;

export interface Listening {
  words: readonly string[];
  sampleRate: number;
  hear: (result: VoskResult) => void;
}

const workerOf = (model: Model) => (model as unknown as { worker?: Worker }).worker;

export function endVoiceModel(model: Model) {
  workerOf(model)?.terminate();
}

export async function loadVoiceModel(url: string): Promise<Model> {
  const { Model: VoskModel } = await import('vosk-browser');
  const model = new VoskModel(url, QUIET);

  return new Promise((resolve, reject) => {
    let loaded = false;
    const refuse = (why: string) => {
      if (loaded) return;

      endVoiceModel(model);
      reject(new Error(why));
    };

    model.on('load', (message) => {
      loaded = message.event === 'load' && message.result;

      if (loaded) resolve(model);
      else refuse('load');
    });
    model.on('error', (message) => refuse(message.event === 'error' ? message.error : 'error'));
  });
}

export function listen(model: Model, { words, sampleRate, hear }: Listening): KaldiRecognizer {
  const recognizer = new model.KaldiRecognizer(sampleRate, voiceGrammar(words));

  recognizer.setWords(true);
  recognizer.on('result', (message) => {
    if (message.event === 'result') hear(message.result);
  });

  return recognizer;
}

export function acceptSamples(recognizer: KaldiRecognizer, samples: Float32Array, sampleRate: number) {
  const step = Math.max(1, Math.round(sampleRate * CHUNK_SECONDS));

  for (let at = 0; at < samples.length; at += step) {
    recognizer.acceptWaveformFloat(samples.slice(at, at + step), sampleRate);
  }

  recognizer.retrieveFinalResult();
}
